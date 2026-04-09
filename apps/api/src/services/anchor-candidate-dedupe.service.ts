import {
  ImportSourceSubtype,
  ObligationSource,
  ObligationType,
  type TrackedAnchor
} from "@prisma/client";
import {
  evaluateAnchorObligationMatch,
  type AnchorObligationSignal
} from "./anchor-obligation-match.service";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DedupeObligationCandidate = {
  obligationId: string;
  title: string;
  vendorName: string | null;
  obligationType: ObligationType | null;
  dueDate: Date | null;
  renewalDate: Date | null;
  recurrence: string | null;
  amount: number | null;
  currencyCode: string | null;
  confidenceScore: number | null;
  sourceType: ObligationSource | null;
  importSourceSubtype: ImportSourceSubtype | null;
};

export type AnchorDedupeDecision = {
  anchorId: string;
  obligationId: string;
  decision: "SUPPRESSED_IN_FAVOR_OF_GMAIL" | "AMBIGUOUS";
  reason:
    | "STRONG_GMAIL_MATCH"
    | "MULTIPLE_CLOSE_MATCHES"
    | "MATCH_NOT_CONCRETE_ENOUGH";
  score: number;
};

export type AnchorDedupePlan = {
  suppressionKeys: Set<string>;
  suppressedAnchorIds: Set<string>;
  decisions: AnchorDedupeDecision[];
};

export class AnchorCandidateDedupeService {
  buildSuppressionPlan(input: {
    anchors: TrackedAnchor[];
    obligations: DedupeObligationCandidate[];
    now?: Date;
  }): AnchorDedupePlan {
    const now = input.now ?? new Date();
    const suppressionKeys = new Set<string>();
    const suppressedAnchorIds = new Set<string>();
    const decisions: AnchorDedupeDecision[] = [];

    for (const obligation of input.obligations) {
      const titleKey = normalizeLabel(obligation.title);
      if (titleKey) suppressionKeys.add(titleKey);
      const vendorKey = normalizeLabel(obligation.vendorName);
      if (vendorKey) suppressionKeys.add(vendorKey);
    }

    for (const anchor of input.anchors) {
      const ranked = input.obligations
        .map((obligation) => {
          const signal: AnchorObligationSignal = {
            obligationId: obligation.obligationId,
            title: obligation.title,
            vendorName: obligation.vendorName,
            obligationType: obligation.obligationType,
            dueDate: obligation.dueDate ?? obligation.renewalDate,
            recurrence: obligation.recurrence,
            amount: obligation.amount,
            currencyCode: obligation.currencyCode,
            confidenceScore: obligation.confidenceScore,
            source: obligation.sourceType
          };
          const match = evaluateAnchorObligationMatch(anchor, signal);
          return { obligation, match };
        })
        .filter((item) => item.match.strength !== "NONE")
        .sort((left, right) => right.match.score - left.match.score);

      if (ranked.length === 0) continue;

      const best = ranked[0];
      if (!best) continue;

      const second = ranked[1] ?? null;
      if (
        second &&
        Math.abs(best.match.score - second.match.score) <= 0.06 &&
        second.match.score >= 0.62
      ) {
        decisions.push({
          anchorId: anchor.id,
          obligationId: best.obligation.obligationId,
          decision: "AMBIGUOUS",
          reason: "MULTIPLE_CLOSE_MATCHES",
          score: best.match.score
        });
        continue;
      }

      if (best.match.strength !== "STRONG") {
        continue;
      }

      if (!shouldPreferObligationCandidate(best.obligation, now)) {
        decisions.push({
          anchorId: anchor.id,
          obligationId: best.obligation.obligationId,
          decision: "AMBIGUOUS",
          reason: "MATCH_NOT_CONCRETE_ENOUGH",
          score: best.match.score
        });
        continue;
      }

      suppressedAnchorIds.add(anchor.id);
      decisions.push({
        anchorId: anchor.id,
        obligationId: best.obligation.obligationId,
        decision: "SUPPRESSED_IN_FAVOR_OF_GMAIL",
        reason: "STRONG_GMAIL_MATCH",
        score: best.match.score
      });
    }

    return {
      suppressionKeys,
      suppressedAnchorIds,
      decisions
    };
  }
}

function shouldPreferObligationCandidate(
  obligation: DedupeObligationCandidate,
  now: Date
) {
  const isGmailBacked =
    obligation.sourceType === "EMAIL" ||
    obligation.importSourceSubtype === ImportSourceSubtype.GMAIL_READONLY;
  if (!isGmailBacked) return false;

  const confidence = obligation.confidenceScore ?? 0;
  if (confidence < 0.7) return false;

  const timing = obligation.dueDate ?? obligation.renewalDate;
  if (!timing) return false;

  const dayDelta = Math.abs(
    Math.round((timing.getTime() - now.getTime()) / DAY_MS)
  );
  return dayDelta <= 45;
}

function normalizeLabel(value: string | null | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
