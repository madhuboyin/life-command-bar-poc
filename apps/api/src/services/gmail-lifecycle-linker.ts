import { Prisma, SubscriptionLifecycleState } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import type { GmailClassifierV2Result } from "./gmail-classifier-v2";
import type { GmailSubscriptionExtractionResult } from "./gmail-subscription-extractor";

export type GmailLifecycleLinkResult = {
  linkedSubscriptionId: string | null;
  linkedLifecycleState: SubscriptionLifecycleState | null;
  matchScore: number;
  conflictSignals: string[];
  historySignals: string[];
  shouldCreateNewSubscription: boolean;
};

type LifecycleLinkInput = {
  userId: string;
  classification: GmailClassifierV2Result;
  extraction: GmailSubscriptionExtractionResult;
  observedAtIso: string | null;
};

export async function linkGmailLifecycleSignal(
  input: LifecycleLinkInput
): Promise<GmailLifecycleLinkResult> {
  const vendorKey = normalizeKey(input.extraction.vendor ?? "");
  if (!vendorKey) {
    return {
      linkedSubscriptionId: null,
      linkedLifecycleState: null,
      matchScore: 0,
      conflictSignals: [],
      historySignals: [],
      shouldCreateNewSubscription: true
    };
  }

  const subscriptions = await prisma.subscriptionRegistry.findMany({
    where: {
      userId: input.userId,
      OR: [
        { vendorNormalizedKey: vendorKey },
        {
          vendorName: {
            contains: input.extraction.vendor ?? "",
            mode: "insensitive"
          }
        }
      ]
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 12,
    include: {
      evidence: {
        where: {
          sourceType: "GMAIL"
        },
        orderBy: [{ observedAt: "desc" }],
        take: 12
      }
    }
  });

  let best:
    | {
        id: string;
        lifecycleState: SubscriptionLifecycleState;
        score: number;
        conflictSignals: string[];
        historySignals: string[];
      }
    | null = null;

  for (const candidate of subscriptions) {
    const scored = scoreCandidate({
      candidate: {
        id: candidate.id,
        lifecycleState: candidate.lifecycleState,
        planName: candidate.planName,
        recurringPrice: decimalToNumber(candidate.recurringPrice),
        amountLastCharged: decimalToNumber(candidate.amountLastCharged),
        billingPeriod: candidate.billingPeriod,
        evidenceCount: candidate.evidence.length
      },
      extraction: input.extraction,
      classType: input.classification.classType,
      observedAtIso: input.observedAtIso
    });
    if (!best || scored.score > best.score) {
      best = {
        id: candidate.id,
        lifecycleState: candidate.lifecycleState,
        score: scored.score,
        conflictSignals: scored.conflictSignals,
        historySignals: scored.historySignals
      };
    }
  }

  if (!best || best.score < 0.5) {
    return {
      linkedSubscriptionId: null,
      linkedLifecycleState: null,
      matchScore: best?.score ?? 0,
      conflictSignals: best?.conflictSignals ?? [],
      historySignals: best?.historySignals ?? [],
      shouldCreateNewSubscription: true
    };
  }

  return {
    linkedSubscriptionId: best.id,
    linkedLifecycleState: best.lifecycleState,
    matchScore: best.score,
    conflictSignals: best.conflictSignals,
    historySignals: best.historySignals,
    shouldCreateNewSubscription: false
  };
}

function scoreCandidate(input: {
  candidate: {
    id: string;
    lifecycleState: SubscriptionLifecycleState;
    planName: string | null;
    recurringPrice: number | null;
    amountLastCharged: number | null;
    billingPeriod: string;
    evidenceCount: number;
  };
  extraction: GmailSubscriptionExtractionResult;
  classType: GmailClassifierV2Result["classType"];
  observedAtIso: string | null;
}) {
  let score = 0.42;
  const conflictSignals: string[] = [];
  const historySignals: string[] = [];

  if (input.extraction.planName && input.candidate.planName) {
    const incomingPlan = normalizeKey(input.extraction.planName);
    const existingPlan = normalizeKey(input.candidate.planName);
    if (incomingPlan === existingPlan) {
      score += 0.2;
      historySignals.push("plan_match_exact");
    } else if (incomingPlan.includes(existingPlan) || existingPlan.includes(incomingPlan)) {
      score += 0.12;
      historySignals.push("plan_match_partial");
    }
  }

  const incomingRecurring = input.extraction.recurringPrice;
  if (incomingRecurring !== null && input.candidate.recurringPrice !== null) {
    const delta = Math.abs(incomingRecurring - input.candidate.recurringPrice);
    if (delta <= 0.51) {
      score += 0.14;
      historySignals.push("recurring_price_match");
    } else if (delta >= 6) {
      conflictSignals.push("recurring_price_delta_large");
    }
  }

  const incomingCharge = input.extraction.amountCharged;
  if (incomingCharge !== null && input.candidate.amountLastCharged !== null) {
    const delta = Math.abs(incomingCharge - input.candidate.amountLastCharged);
    if (delta <= 0.51) {
      score += 0.1;
      historySignals.push("charged_amount_match");
    } else if (delta >= 8) {
      conflictSignals.push("charged_amount_delta_large");
    }
  }

  if (
    input.extraction.billingPeriod !== "UNKNOWN" &&
    input.candidate.billingPeriod === input.extraction.billingPeriod
  ) {
    score += 0.1;
    historySignals.push("billing_period_match");
  }

  if (input.candidate.evidenceCount >= 3) {
    score += 0.06;
    historySignals.push("gmail_evidence_history");
  }

  if (
    input.classType === "SUBSCRIPTION_CANCELLATION" &&
    input.candidate.lifecycleState === SubscriptionLifecycleState.CANCELED
  ) {
    score += 0.08;
  }

  if (
    input.classType === "SUBSCRIPTION_RECEIPT" &&
    (input.candidate.lifecycleState === SubscriptionLifecycleState.CANCELED ||
      input.candidate.lifecycleState === SubscriptionLifecycleState.ENDED)
  ) {
    conflictSignals.push("receipt_after_canceled_state");
    score -= 0.12;
  }

  if (input.observedAtIso) {
    const observedAt = new Date(input.observedAtIso);
    if (!Number.isNaN(observedAt.getTime())) {
      const daysAgo = (Date.now() - observedAt.getTime()) / (24 * 60 * 60 * 1000);
      if (daysAgo <= 45) score += 0.06;
    }
  }

  score -= Math.min(0.18, conflictSignals.length * 0.08);
  return {
    score: clamp(score, 0, 1),
    conflictSignals,
    historySignals
  };
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function decimalToNumber(value: Prisma.Decimal | null) {
  return value ? Number(value) : null;
}
