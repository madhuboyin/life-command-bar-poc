import { SubscriptionBillingPeriod, SubscriptionLifecycleState } from "@prisma/client";

export type SubscriptionMatchSignal = {
  vendorName: string;
  vendorNormalizedKey: string;
  planName: string | null;
  billingPeriod: SubscriptionBillingPeriod;
  recurringPrice: number | null;
  amountLastCharged: number | null;
};

export type SubscriptionMatchCandidate = {
  id: string;
  vendorName: string;
  vendorNormalizedKey: string;
  planName: string | null;
  billingPeriod: SubscriptionBillingPeriod;
  recurringPrice: number | null;
  amountLastCharged: number | null;
  lifecycleState: SubscriptionLifecycleState;
};

export type SubscriptionMatchResult = {
  candidate: SubscriptionMatchCandidate;
  score: number;
  rationale: string[];
};

export function normalizeVendorKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function pickBestSubscriptionMatch(input: {
  signal: SubscriptionMatchSignal;
  candidates: SubscriptionMatchCandidate[];
}): SubscriptionMatchResult | null {
  let best: SubscriptionMatchResult | null = null;
  let secondBest: SubscriptionMatchResult | null = null;

  for (const candidate of input.candidates) {
    const score = scoreSubscriptionMatch({
      signal: input.signal,
      candidate
    });

    const result = {
      candidate,
      score: score.value,
      rationale: score.rationale
    };

    if (!best || result.score > best.score) {
      secondBest = best;
      best = result;
      continue;
    }

    if (!secondBest || result.score > secondBest.score) {
      secondBest = result;
    }
  }

  if (!best) return null;

  const threshold = input.signal.planName ? 0.62 : 0.76;
  if (best.score < threshold) {
    return null;
  }

  if (secondBest && best.score - secondBest.score < 0.08) {
    return null;
  }

  return best;
}

function scoreSubscriptionMatch(input: {
  signal: SubscriptionMatchSignal;
  candidate: SubscriptionMatchCandidate;
}) {
  const rationale: string[] = [];
  let score = 0;

  if (input.signal.vendorNormalizedKey === input.candidate.vendorNormalizedKey) {
    score += 0.66;
    rationale.push("vendor_key_exact");
  } else if (
    input.signal.vendorNormalizedKey &&
    input.candidate.vendorNormalizedKey &&
    (input.signal.vendorNormalizedKey.includes(input.candidate.vendorNormalizedKey) ||
      input.candidate.vendorNormalizedKey.includes(input.signal.vendorNormalizedKey))
  ) {
    score += 0.48;
    rationale.push("vendor_key_partial");
  }

  if (input.signal.planName && input.candidate.planName) {
    const normalizedSignalPlan = normalizeVendorKey(input.signal.planName);
    const normalizedCandidatePlan = normalizeVendorKey(input.candidate.planName);
    if (normalizedSignalPlan === normalizedCandidatePlan) {
      score += 0.2;
      rationale.push("plan_exact");
    } else if (
      normalizedSignalPlan.includes(normalizedCandidatePlan) ||
      normalizedCandidatePlan.includes(normalizedSignalPlan)
    ) {
      score += 0.12;
      rationale.push("plan_partial");
    }
  }

  if (
    input.signal.billingPeriod !== SubscriptionBillingPeriod.UNKNOWN &&
    input.signal.billingPeriod === input.candidate.billingPeriod
  ) {
    score += 0.08;
    rationale.push("billing_period_match");
  }

  const incomingAmount =
    input.signal.recurringPrice ?? input.signal.amountLastCharged ?? null;
  const candidateAmount =
    input.candidate.recurringPrice ?? input.candidate.amountLastCharged ?? null;
  if (
    incomingAmount !== null &&
    candidateAmount !== null &&
    Math.abs(incomingAmount - candidateAmount) <= 0.75
  ) {
    score += 0.08;
    rationale.push("amount_near");
  }

  if (
    input.candidate.lifecycleState === SubscriptionLifecycleState.ACTIVE ||
    input.candidate.lifecycleState === SubscriptionLifecycleState.RENEWING ||
    input.candidate.lifecycleState === SubscriptionLifecycleState.PRICE_CHANGED
  ) {
    score += 0.04;
    rationale.push("active_candidate");
  }

  return {
    value: clamp(score, 0, 1),
    rationale
  };
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}
