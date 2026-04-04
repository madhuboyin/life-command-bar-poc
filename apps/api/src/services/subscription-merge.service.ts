import {
  SubscriptionConfidenceBand,
  SubscriptionLifecycleState
} from "@prisma/client";

type MergeCandidate = {
  id: string;
  subscriptionTitle: string;
  planName: string | null;
  recurringPrice: number | null;
  currency: string | null;
  nextRenewalDate: Date | null;
  lifecycleState: SubscriptionLifecycleState;
  sourceConfidenceScore: number;
  sourceConfidenceBand: SubscriptionConfidenceBand;
};

export class SubscriptionMergeService {
  mergeState(primary: MergeCandidate, secondary: MergeCandidate) {
    const lifecycleState = pickLifecycleState(primary.lifecycleState, secondary.lifecycleState);
    const sourceConfidenceScore = Math.max(
      primary.sourceConfidenceScore,
      secondary.sourceConfidenceScore
    );

    return {
      subscriptionTitle: pickTitle(primary.subscriptionTitle, secondary.subscriptionTitle),
      planName: primary.planName ?? secondary.planName,
      recurringPrice: primary.recurringPrice ?? secondary.recurringPrice,
      currency: primary.currency ?? secondary.currency,
      nextRenewalDate: primary.nextRenewalDate ?? secondary.nextRenewalDate,
      lifecycleState,
      sourceConfidenceScore,
      sourceConfidenceBand: toConfidenceBand(sourceConfidenceScore)
    };
  }
}

function pickTitle(primary: string, secondary: string) {
  if (primary.length >= secondary.length) return primary;
  return secondary;
}

function pickLifecycleState(
  primary: SubscriptionLifecycleState,
  secondary: SubscriptionLifecycleState
) {
  const rank: Record<SubscriptionLifecycleState, number> = {
    UNKNOWN: 0,
    DISCOVERED: 1,
    TRIALING: 2,
    ACTIVE: 3,
    RENEWING: 4,
    PRICE_CHANGED: 5,
    CANCELING: 6,
    CANCELED: 7,
    ENDED: 8,
    INACTIVE: 9
  };
  return rank[primary] >= rank[secondary] ? primary : secondary;
}

function toConfidenceBand(score: number): SubscriptionConfidenceBand {
  if (score >= 0.78) return SubscriptionConfidenceBand.HIGH;
  if (score >= 0.48) return SubscriptionConfidenceBand.MEDIUM;
  return SubscriptionConfidenceBand.LOW;
}
