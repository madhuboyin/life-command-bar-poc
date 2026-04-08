import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { PersonalizationSignalService } from "./personalization-signal.service";
import type {
  BehaviorSignalSummary,
  RecordBehaviorSignalInput
} from "../types/behavior-profile.types";
import type { PersonalizationSignalRepository } from "../repositories/personalization-signal.repository";

function createSignalServiceHarness() {
  const rows: Array<{
    id: string;
    userId: string;
    obligationId: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
  }> = [];
  let id = 0;

  const repository = {
    async createSignalEvent(input: {
      userId: string;
      obligationId?: string | null;
      metadata: Prisma.InputJsonValue;
    }) {
      id += 1;
      const metadata = input.metadata as Record<string, unknown>;
      const createdAt =
        typeof metadata.occurredAt === "string"
          ? new Date(metadata.occurredAt)
          : new Date("2026-01-01T00:00:00.000Z");

      rows.push({
        id: `evt_${id}`,
        userId: input.userId,
        obligationId: input.obligationId ?? null,
        metadata: input.metadata as Prisma.JsonValue,
        createdAt
      });
    },
    async listSignalEvents(input: {
      userId: string;
      windowStart?: Date;
      windowEnd?: Date;
      limit?: number;
    }) {
      return rows
        .filter((row) => row.userId === input.userId)
        .filter((row) =>
          input.windowStart ? row.createdAt.getTime() >= input.windowStart.getTime() : true
        )
        .filter((row) =>
          input.windowEnd ? row.createdAt.getTime() <= input.windowEnd.getTime() : true
        )
        .slice(0, input.limit ?? 5000);
    },
    async countSignalEventsSince(input: { userId: string; since?: Date | null }) {
      return rows.filter((row) => row.userId === input.userId).filter((row) => {
        if (!input.since) return true;
        return row.createdAt.getTime() > input.since.getTime();
      }).length;
    }
  } as unknown as PersonalizationSignalRepository;

  const service = new PersonalizationSignalService({
    repository,
    now: () => new Date("2026-02-01T00:00:00.000Z")
  });

  return {
    service,
    rows
  };
}

test("recordSignal persists a behavior signal event", async () => {
  const { service, rows } = createSignalServiceHarness();

  await service.recordSignal({
    userId: "user_signal",
    signalType: "ITEM_ACTED",
    itemId: "obl_1",
    source: "TODAY_VIEW",
    metadata: {
      actionType: "CONFIRM"
    }
  });

  assert.equal(rows.length, 1);
  const metadata = rows[0]?.metadata as Record<string, unknown>;
  assert.equal(metadata.signalType, "ITEM_ACTED");
  assert.equal(metadata.itemId, "obl_1");
  assert.equal(metadata.source, "TODAY_VIEW");
});

test("summarizeBehaviorSignals computes deterministic counts and medians", async () => {
  const { service } = createSignalServiceHarness();
  const base = new Date("2026-02-02T10:00:00.000Z");

  const signals: RecordBehaviorSignalInput[] = [
    {
      userId: "user_summary",
      signalType: "ITEM_IMPRESSED",
      itemId: "obl_a",
      occurredAt: base,
      source: "TODAY_VIEW"
    },
    {
      userId: "user_summary",
      signalType: "ITEM_IMPRESSED",
      itemId: "obl_b",
      occurredAt: new Date(base.getTime() + 60_000),
      source: "TODAY_VIEW"
    },
    {
      userId: "user_summary",
      signalType: "DETAIL_OPENED",
      itemId: "obl_a",
      occurredAt: new Date(base.getTime() + 120_000),
      source: "TODAY_VIEW"
    },
    {
      userId: "user_summary",
      signalType: "REVIEW_STARTED",
      itemId: "obl_a",
      occurredAt: new Date(base.getTime() + 180_000),
      source: "TODAY_VIEW"
    },
    {
      userId: "user_summary",
      signalType: "ITEM_ACTED",
      itemId: "obl_a",
      occurredAt: new Date(base.getTime() + 300_000),
      source: "TODAY_VIEW",
      metadata: {
        actionType: "CONFIRM"
      }
    },
    {
      userId: "user_summary",
      signalType: "ITEM_DEFERRED",
      itemId: "obl_b",
      occurredAt: new Date(base.getTime() + 720_000),
      source: "TODAY_VIEW",
      metadata: {
        actionType: "REMIND_LATER"
      }
    }
  ];

  await service.recordSignals(signals);
  const summary = await service.summarizeBehaviorSignals({
    userId: "user_summary",
    windowStart: new Date(base.getTime() - 1000),
    windowEnd: new Date(base.getTime() + 1_000_000)
  });

  assert.equal(summary.signals.totalImpressions, 2);
  assert.equal(summary.signals.totalActions, 1);
  assert.equal(summary.signals.totalDefers, 1);
  assert.equal(summary.signals.totalDetailOpens, 1);
  assert.equal(summary.signals.totalReviewStarts, 1);
  assert.equal(summary.signals.directActionCount, 1);
  assert.equal(summary.signals.decisionEventCount, 2);
  assert.equal(summary.signals.medianTimeToActionMs, 300_000);
  assert.equal(summary.signals.medianTimeToFirstActionMs, 300_000);
});

test("summary dedupes near-identical duplicate signals", async () => {
  const { service } = createSignalServiceHarness();
  const base = new Date("2026-02-03T10:00:00.000Z");

  await service.recordSignals([
    {
      userId: "user_dupe",
      signalType: "ITEM_IMPRESSED",
      itemId: "obl_dup",
      source: "DAILY_PULSE",
      occurredAt: base
    },
    {
      userId: "user_dupe",
      signalType: "ITEM_IMPRESSED",
      itemId: "obl_dup",
      source: "DAILY_PULSE",
      occurredAt: new Date(base.getTime() + 20_000)
    }
  ]);

  const summary = await service.summarizeBehaviorSignals({
    userId: "user_dupe",
    windowStart: new Date(base.getTime() - 1000),
    windowEnd: new Date(base.getTime() + 60_000)
  });

  assert.equal(summary.signals.totalImpressions, 1);
});

test("buildBehaviorSignalSummary computes median from explicit timing metadata", () => {
  const { service } = createSignalServiceHarness();
  const base = new Date("2026-02-04T10:00:00.000Z");

  const makeSignal = (offsetMs: number, durationMs: number) => ({
    id: `sig_${offsetMs}`,
    userId: "user_median",
    signalType: "ITEM_ACTED" as const,
    occurredAt: new Date(base.getTime() + offsetMs),
    createdAt: new Date(base.getTime() + offsetMs),
    obligationId: "obl_median",
    itemId: "obl_median",
    sessionId: null,
    category: "OBLIGATION",
    source: "OBLIGATION_ACTION" as const,
    metadata: {
      actionType: "CONFIRM" as const,
      timeToActionMs: durationMs
    }
  });

  const summary: BehaviorSignalSummary = service.buildBehaviorSignalSummary([
    {
      id: "imp",
      userId: "user_median",
      signalType: "ITEM_IMPRESSED",
      occurredAt: base,
      createdAt: base,
      obligationId: "obl_median",
      itemId: "obl_median",
      sessionId: null,
      category: "OBLIGATION",
      source: "OBLIGATION_ACTION",
      metadata: {}
    },
    makeSignal(60_000, 300_000),
    makeSignal(120_000, 600_000),
    makeSignal(180_000, 1_200_000)
  ]);

  assert.equal(summary.timedActionSampleCount, 3);
  assert.equal(summary.medianTimeToActionMs, 600_000);
});

test("getSignalsForUser ignores malformed event metadata safely", async () => {
  const { service, rows } = createSignalServiceHarness();
  rows.push({
    id: "bad_1",
    userId: "user_bad",
    obligationId: null,
    metadata: {
      signalType: "NOT_A_REAL_SIGNAL"
    },
    createdAt: new Date("2026-02-05T00:00:00.000Z")
  });

  const signals = await service.getSignalsForUser({
    userId: "user_bad"
  });

  assert.equal(signals.length, 0);
});
