import type { EffortLevel } from "@prisma/client";

type EstimateInput = {
  effortLevel: EffortLevel;
  needsReview: boolean;
  confidenceScore: number;
};

/**
 * Focus-mode duration heuristic (deterministic):
 * - LOW effort tasks are short and usually fit in 2-3 minutes.
 * - MEDIUM effort tasks usually fit in 5-7 minutes.
 * - HIGH effort tasks are 10+ minutes and should be rare in short sessions.
 * We add small penalties for low confidence / review-needed items.
 */
export function estimateFocusMinutes(input: EstimateInput) {
  const base =
    input.effortLevel === "LOW" ? 3 : input.effortLevel === "MEDIUM" ? 6 : 11;

  let adjusted = base;
  if (input.needsReview) adjusted += 1;
  if (input.confidenceScore < 0.48) adjusted += 2;
  else if (input.confidenceScore < 0.78) adjusted += 1;

  return clamp(Math.round(adjusted), 2, 15);
}

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.min(maxValue, Math.max(minValue, value));
}
