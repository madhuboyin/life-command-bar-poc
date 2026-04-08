import { BEHAVIOR_SIGNAL_ACTION_TYPES, BEHAVIOR_SIGNAL_TYPES } from "../types/behavior-profile.types";
import {
  type BehaviorProfileComputationInput,
  type BehaviorSignalMetadata,
  type BehaviorSignalRecord,
  type BehaviorSignalSource,
  type BehaviorSignalSummary,
  type BehaviorSignalSummaryRequest,
  type BehaviorSignalSummaryResult,
  type BehaviorSignalType,
  type BehaviorSignalWindowInput,
  type RecordBehaviorSignalInput,
  buildEmptyBehaviorSignalSummary
} from "../types/behavior-profile.types";
import { PersonalizationSignalRepository } from "../repositories/personalization-signal.repository";

const DEFAULT_SIGNAL_LOOKBACK_DAYS = 60;
const DEFAULT_SIGNAL_LIMIT = 5000;
const SESSION_GAP_MS = 30 * 60 * 1000;
const MAX_ACTION_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const QUICK_ACTION_THRESHOLD_MS = 15 * 60 * 1000;

type ServiceDependencies = {
  repository?: PersonalizationSignalRepository;
  now?: () => Date;
};

export class PersonalizationSignalService {
  private readonly repository: PersonalizationSignalRepository;
  private readonly now: () => Date;

  constructor(dependencies: ServiceDependencies = {}) {
    this.repository = dependencies.repository ?? new PersonalizationSignalRepository();
    this.now = dependencies.now ?? (() => new Date());
  }

  async recordSignal(input: RecordBehaviorSignalInput): Promise<void> {
    const normalized = normalizeSignalInput(input, this.now);
    await this.repository.createSignalEvent({
      userId: normalized.userId,
      obligationId: normalized.obligationId,
      metadata: toPersistedSignalMetadata(normalized)
    });
  }

  async recordSignals(inputs: RecordBehaviorSignalInput[]): Promise<void> {
    if (inputs.length === 0) return;

    const normalized = inputs.map((input) => normalizeSignalInput(input, this.now));
    const uniqueSignals = dedupeSignalsInBatch(normalized);

    await Promise.all(
      uniqueSignals.map((signal) =>
        this.repository.createSignalEvent({
          userId: signal.userId,
          obligationId: signal.obligationId,
          metadata: toPersistedSignalMetadata(signal)
        })
      )
    );
  }

  async recordBehaviorSignal(input: RecordBehaviorSignalInput): Promise<void> {
    return this.recordSignal(input);
  }

  async recordBehaviorSignals(inputs: RecordBehaviorSignalInput[]): Promise<void> {
    return this.recordSignals(inputs);
  }

  async getSignalsForUser(input: BehaviorSignalWindowInput): Promise<BehaviorSignalRecord[]> {
    const now = this.now();
    const windowEnd = input.windowEnd ?? now;
    const windowStart =
      input.windowStart ?? subtractDays(windowEnd, DEFAULT_SIGNAL_LOOKBACK_DAYS);

    const rows = await this.repository.listSignalEvents({
      userId: input.userId,
      windowStart,
      windowEnd,
      limit: input.limit ?? DEFAULT_SIGNAL_LIMIT
    });

    return rows
      .map((row) => parseSignalRow(row))
      .filter((item): item is BehaviorSignalRecord => item !== null)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  async summarizeSignalsForUser(
    input: BehaviorSignalSummaryRequest
  ): Promise<BehaviorSignalSummaryResult> {
    const now = this.now();
    const windowEnd = input.windowEnd ?? now;
    const windowStart =
      input.windowStart ?? subtractDays(windowEnd, DEFAULT_SIGNAL_LOOKBACK_DAYS);

    const signals = await this.getSignalsForUser({
      userId: input.userId,
      windowStart,
      windowEnd,
      limit: input.limit
    });
    const summary = this.buildBehaviorSignalSummary(signals);

    return {
      userId: input.userId,
      sampleSize: summary.sampleSize,
      signals: summary,
      windowStart,
      windowEnd,
      totalSignals: signals.length
    };
  }

  async summarizeBehaviorSignals(
    input: BehaviorSignalSummaryRequest
  ): Promise<BehaviorSignalSummaryResult> {
    return this.summarizeSignalsForUser(input);
  }

  async countSignalsForUserSince(userId: string, since?: Date | null) {
    return this.repository.countSignalEventsSince({
      userId,
      since: since ?? null
    });
  }

  buildBehaviorSignalSummary(signals: BehaviorSignalRecord[]): BehaviorSignalSummary {
    const summary = buildEmptyBehaviorSignalSummary();
    if (signals.length === 0) return summary;

    const dedupedSignals = dedupeSignalsForSummary(signals);
    const timedActionDurations: number[] = [];
    const timeToFirstActionDurations: number[] = [];
    const lastImpressionByItem = new Map<string, Date>();
    const firstImpressionBySession = new Map<string, Date>();
    const firstActionBySession = new Map<string, Date>();
    let autoSessionCounter = 0;
    let lastAutoSessionTimestamp: Date | null = null;

    for (const signal of dedupedSignals) {
      const sessionId = resolveSessionId(signal, {
        getNextSessionId: () => {
          const occurredAt = signal.occurredAt;
          if (
            !lastAutoSessionTimestamp ||
            occurredAt.getTime() - lastAutoSessionTimestamp.getTime() > SESSION_GAP_MS
          ) {
            autoSessionCounter += 1;
          }
          lastAutoSessionTimestamp = occurredAt;
          return `auto:${autoSessionCounter}`;
        }
      });

      switch (signal.signalType) {
        case "ITEM_IMPRESSED": {
          summary.totalImpressions += 1;
          if (signal.itemId) {
            lastImpressionByItem.set(signal.itemId, signal.occurredAt);
          }

          if (!firstImpressionBySession.has(sessionId)) {
            firstImpressionBySession.set(sessionId, signal.occurredAt);
          }
          break;
        }
        case "ITEM_ACTED": {
          summary.totalActions += 1;
          summary.decisionEventCount += 1;
          if (!isReviewAction(signal.metadata)) {
            summary.directActionCount += 1;
          }

          if (!firstActionBySession.has(sessionId)) {
            firstActionBySession.set(sessionId, signal.occurredAt);
          }

          const providedTimeToAction = asNumber(signal.metadata.timeToActionMs);
          if (isValidDuration(providedTimeToAction)) {
            timedActionDurations.push(providedTimeToAction);
          } else if (signal.itemId) {
            const impressionAt = lastImpressionByItem.get(signal.itemId);
            if (impressionAt) {
              const derivedDuration = signal.occurredAt.getTime() - impressionAt.getTime();
              if (derivedDuration >= 0 && derivedDuration <= MAX_ACTION_LOOKBACK_MS) {
                timedActionDurations.push(derivedDuration);
              }
            }
          }
          break;
        }
        case "ITEM_DEFERRED": {
          summary.totalDefers += 1;
          summary.decisionEventCount += 1;

          if (!firstActionBySession.has(sessionId)) {
            firstActionBySession.set(sessionId, signal.occurredAt);
          }
          break;
        }
        case "DETAIL_OPENED": {
          summary.totalDetailOpens += 1;
          break;
        }
        case "WHY_THIS_OPENED": {
          summary.totalWhyThisOpens += 1;
          break;
        }
        case "REVIEW_STARTED": {
          summary.totalReviewStarts += 1;
          break;
        }
        case "REVIEW_COMPLETED": {
          summary.totalReviewCompletions += 1;
          break;
        }
        case "ITEM_LEFT_UNTOUCHED":
        default:
          break;
      }
    }

    for (const [sessionId, impressionAt] of firstImpressionBySession) {
      const firstActionAt = firstActionBySession.get(sessionId);
      if (!firstActionAt) continue;

      const duration = firstActionAt.getTime() - impressionAt.getTime();
      if (duration < 0 || duration > MAX_SESSION_DURATION_MS) continue;
      timeToFirstActionDurations.push(duration);
    }

    summary.timedActionSampleCount = timedActionDurations.length;
    summary.quickTimedActionCount = timedActionDurations.filter(
      (duration) => duration <= QUICK_ACTION_THRESHOLD_MS
    ).length;
    summary.medianTimeToActionMs = computeMedian(timedActionDurations);
    summary.medianTimeToFirstActionMs = computeMedian(timeToFirstActionDurations);
    summary.reviewPathCount =
      summary.totalReviewStarts + summary.totalReviewCompletions;
    summary.sampleSize = this.getSignalSampleSize(summary);

    return summary;
  }

  getSignalSampleSize(summary: BehaviorSignalSummary) {
    return Math.max(
      summary.totalImpressions,
      summary.decisionEventCount,
      summary.directActionCount + summary.totalReviewStarts
    );
  }

  async buildComputationInput(input: {
    userId: string;
    windowStart?: Date;
    windowEnd?: Date;
  }): Promise<BehaviorProfileComputationInput> {
    const summary = await this.summarizeSignalsForUser({
      userId: input.userId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd
    });

    return {
      userId: summary.userId,
      sampleSize: summary.sampleSize,
      signals: summary.signals
    };
  }
}

function normalizeSignalInput(
  input: RecordBehaviorSignalInput,
  now: () => Date
): {
  userId: string;
  signalType: BehaviorSignalType;
  occurredAt: Date;
  obligationId: string | null;
  itemId: string | null;
  sessionId: string | null;
  category: string | null;
  source: string | null;
  metadata: BehaviorSignalMetadata;
} {
  const occurredAt = input.occurredAt ?? now();
  const itemId = input.itemId ?? input.obligationId ?? null;
  const source = asBehaviorSignalSource(input.source) ?? "SYSTEM";
  const category = asString(input.category) ?? null;
  const sessionId = asString(input.sessionId) ?? null;
  const obligationId = input.obligationId ?? null;
  const metadata: BehaviorSignalMetadata = {
    ...sanitizeRecord(input.metadata),
    source,
    category,
    sessionId,
    itemId,
    obligationId
  };

  return {
    userId: input.userId,
    signalType: input.signalType,
    occurredAt,
    obligationId,
    itemId,
    sessionId,
    category,
    source,
    metadata
  };
}

function toPersistedSignalMetadata(signal: {
  signalType: BehaviorSignalType;
  occurredAt: Date;
  itemId: string | null;
  sessionId: string | null;
  category: string | null;
  source: string | null;
  obligationId: string | null;
  metadata: BehaviorSignalMetadata;
}) {
  return {
    signalVersion: 1,
    signalType: signal.signalType,
    occurredAt: signal.occurredAt.toISOString(),
    itemId: signal.itemId,
    sessionId: signal.sessionId,
    category: signal.category,
    source: signal.source,
    obligationId: signal.obligationId,
    ...sanitizeRecord(signal.metadata)
  };
}

function parseSignalRow(input: {
  id: string;
  userId: string;
  obligationId: string | null;
  metadata: unknown;
  createdAt: Date;
}): BehaviorSignalRecord | null {
  const metadata = asRecord(input.metadata);
  const signalType = asBehaviorSignalType(metadata?.signalType);
  if (!signalType) return null;

  const occurredAt = parseDate(metadata?.occurredAt) ?? input.createdAt;
  const itemId = asString(metadata?.itemId) ?? input.obligationId ?? null;
  const source = asString(metadata?.source);
  const category = asString(metadata?.category);
  const sessionId = asString(metadata?.sessionId);

  return {
    id: input.id,
    userId: input.userId,
    signalType,
    occurredAt,
    createdAt: input.createdAt,
    obligationId: asString(metadata?.obligationId) ?? input.obligationId ?? null,
    itemId,
    source: asBehaviorSignalSource(source),
    category,
    sessionId,
    metadata: (metadata ?? {}) as BehaviorSignalMetadata
  };
}

function dedupeSignalsInBatch<
  T extends {
    signalType: BehaviorSignalType;
    itemId: string | null;
    sessionId: string | null;
    source: string | null;
    metadata: BehaviorSignalMetadata;
    occurredAt: Date;
  }
>(signals: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const signal of signals) {
    const key = `${buildSignalFingerprintKey(signal)}|${Math.floor(signal.occurredAt.getTime() / 1000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(signal);
  }

  return result;
}

function dedupeSignalsForSummary(signals: BehaviorSignalRecord[]): BehaviorSignalRecord[] {
  const sorted = [...signals].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const lastSeenAtByFingerprint = new Map<string, Date>();
  const deduped: BehaviorSignalRecord[] = [];

  for (const signal of sorted) {
    const fingerprint = buildSignalFingerprintKey(signal);
    const previous = lastSeenAtByFingerprint.get(fingerprint);
    const windowMs = dedupeWindowMs(signal.signalType);

    if (
      previous &&
      signal.occurredAt.getTime() - previous.getTime() <= windowMs
    ) {
      continue;
    }

    lastSeenAtByFingerprint.set(fingerprint, signal.occurredAt);
    deduped.push(signal);
  }

  return deduped;
}

function buildSignalFingerprintKey(input: {
  signalType: BehaviorSignalType;
  itemId: string | null;
  sessionId: string | null;
  source: string | null;
  metadata: BehaviorSignalMetadata;
  occurredAt: Date;
}) {
  const actionType = asString(input.metadata.actionType) ?? "none";
  return [
    input.signalType,
    input.itemId ?? "none",
    input.sessionId ?? "none",
    input.source ?? "none",
    actionType
  ].join("|");
}

function dedupeWindowMs(signalType: BehaviorSignalType) {
  if (signalType === "ITEM_IMPRESSED") return 60_000;
  if (signalType === "ITEM_ACTED" || signalType === "ITEM_DEFERRED") return 15_000;
  return 10_000;
}

function resolveSessionId(
  signal: BehaviorSignalRecord,
  input: {
    getNextSessionId: () => string;
  }
) {
  return signal.sessionId ?? input.getNextSessionId();
}

function isReviewAction(metadata: BehaviorSignalMetadata) {
  const actionType = asString(metadata.actionType);
  return actionType === "REVIEW";
}

function computeMedian(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }
  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (left === undefined || right === undefined) return null;
  return Math.round((left + right) / 2);
}

function isValidDuration(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= MAX_ACTION_LOOKBACK_MS;
}

function asBehaviorSignalType(value: unknown): BehaviorSignalType | null {
  if (typeof value !== "string") return null;
  if (!BEHAVIOR_SIGNAL_TYPES.includes(value as BehaviorSignalType)) return null;
  return value as BehaviorSignalType;
}

function asBehaviorSignalSource(value: unknown): BehaviorSignalSource | null {
  if (typeof value !== "string") return null;
  if (
    value === "TODAY_VIEW" ||
    value === "DAILY_PULSE" ||
    value === "OBLIGATION_ACTION" ||
    value === "SUBSCRIPTION_REVIEW" ||
    value === "OUTCOME_FEEDBACK" ||
    value === "SYSTEM"
  ) {
    return value;
  }
  return null;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseDate(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function sanitizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(input)) {
    output[key] = sanitizeValue(raw);
  }

  const actionType = asString(output.actionType);
  if (
    actionType &&
    !BEHAVIOR_SIGNAL_ACTION_TYPES.includes(actionType as (typeof BEHAVIOR_SIGNAL_ACTION_TYPES)[number])
  ) {
    delete output.actionType;
  }

  return output;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (typeof value === "object") {
    const nested: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      nested[key] = sanitizeValue(nestedValue);
    }
    return nested;
  }
  return String(value);
}

function subtractDays(base: Date, days: number) {
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
}
