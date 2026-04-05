import { createAuditEvent } from "../observability/audit-event";
import { normalizeVendorKey } from "./subscription-matcher";
import {
  matchVendorProfile,
  type VendorMatchInput,
  type VendorMatchResult,
  type VendorSignalMatch
} from "./vendor-matcher";
import { type VendorCategory } from "./vendor-profiles";

export type VendorIdentityResolutionInput = {
  userId?: string;
  candidateVendorName?: string | null;
  sender: string;
  subject: string;
  bodyText: string;
  snippet?: string | null;
  lifecycleTypeHint?: VendorMatchInput["lifecycleTypeHint"];
  expectedCategoryHint?: VendorCategory | null;
  source?: string;
  referenceId?: string | null;
  emitAudit?: boolean;
};

export type VendorIdentityResolutionResult = {
  vendorName: string | null;
  vendorKey: string | null;
  vendorNormalizedKey: string | null;
  vendorCategory: VendorCategory;
  match: VendorMatchResult;
  rationale: string[];
};

export class VendorIntelligenceService {
  async resolveVendorIdentity(
    input: VendorIdentityResolutionInput
  ): Promise<VendorIdentityResolutionResult> {
    const match = matchVendorProfile({
      sender: input.sender,
      subject: input.subject,
      bodyText: input.bodyText,
      snippet: input.snippet ?? null,
      lifecycleTypeHint: input.lifecycleTypeHint,
      expectedCategoryHint: input.expectedCategoryHint ?? null
    });

    const fallbackVendor = normalizeNullableVendor(input.candidateVendorName ?? null);
    const resolvedVendorName = match.canonicalName ?? fallbackVendor ?? deriveVendorFromSender(input.sender);
    const resolvedVendorKey = match.vendorKey ?? (resolvedVendorName ? normalizeVendorKey(resolvedVendorName) : null);
    const resolvedNormalizedKey = resolvedVendorName ? normalizeVendorKey(resolvedVendorName) : null;
    const rationale = buildRationale(match, resolvedVendorName);

    if (input.emitAudit && input.userId) {
      await this.emitMatchAudit({
        userId: input.userId,
        source: input.source ?? "unknown",
        referenceId: input.referenceId ?? null,
        match,
        resolvedVendorName,
        resolvedVendorKey: resolvedVendorKey ?? null,
        resolvedNormalizedKey
      });
    }

    return {
      vendorName: resolvedVendorName,
      vendorKey: resolvedVendorKey,
      vendorNormalizedKey: resolvedNormalizedKey,
      vendorCategory: match.category,
      match,
      rationale
    };
  }

  private async emitMatchAudit(input: {
    userId: string;
    source: string;
    referenceId: string | null;
    match: VendorMatchResult;
    resolvedVendorName: string | null;
    resolvedVendorKey: string | null;
    resolvedNormalizedKey: string | null;
  }) {
    const eventType =
      input.match.outcome === "MATCHED"
        ? "vendor_profile_matched"
        : input.match.outcome === "CONFLICT"
          ? "vendor_profile_conflict"
          : input.match.outcome === "SUPPRESSED"
            ? "vendor_profile_suppressed"
            : "vendor_profile_unknown";

    const signals = summarizeSignals(input.match.matchedSignals);

    await createAuditEvent({
      userId: input.userId,
      eventType,
      metadata: {
        source: input.source,
        referenceId: input.referenceId,
        outcome: input.match.outcome,
        score: input.match.score,
        vendorKey: input.match.vendorKey,
        canonicalName: input.match.canonicalName,
        category: input.match.category,
        resolvedVendorName: input.resolvedVendorName,
        resolvedVendorKey: input.resolvedVendorKey,
        resolvedVendorNormalizedKey: input.resolvedNormalizedKey,
        conflicts: input.match.conflicts.map((entry) => ({
          vendorKey: entry.vendorKey,
          canonicalName: entry.canonicalName,
          score: entry.score
        })),
        suppressedReason: input.match.suppressedReason,
        matchedSignals: signals
      }
    }).catch(() => null);
  }
}

function summarizeSignals(signals: VendorSignalMatch[]) {
  return signals.map((signal) => ({
    kind: signal.kind,
    value: signal.value,
    score: signal.score
  }));
}

function normalizeNullableVendor(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

function deriveVendorFromSender(sender: string) {
  const from = sender.trim();
  if (!from) return null;

  const nameMatch = from.match(/^([^<]+)</);
  if (nameMatch?.[1]) {
    const name = nameMatch[1].trim();
    if (name.length > 1) return name.slice(0, 120);
  }

  const domainMatch = from.match(/@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (!domainMatch?.[1]) return null;

  const root = domainMatch[1].split(".")[0]?.replace(/[-_]+/g, " ").trim();
  if (!root || root.length < 2) return null;
  return toTitleCase(root).slice(0, 120);
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function buildRationale(match: VendorMatchResult, resolvedVendorName: string | null) {
  const rationale: string[] = [];
  if (match.outcome === "MATCHED") {
    rationale.push("vendor_profile_matched");
  } else if (match.outcome === "CONFLICT") {
    rationale.push("vendor_profile_conflict");
  } else if (match.outcome === "SUPPRESSED") {
    rationale.push("vendor_profile_suppressed");
  } else {
    rationale.push("vendor_profile_unknown");
  }

  if (resolvedVendorName) {
    rationale.push(`resolved_vendor:${resolvedVendorName}`);
  }

  return rationale;
}
