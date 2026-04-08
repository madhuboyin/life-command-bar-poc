import assert from "node:assert/strict";
import test from "node:test";
import {
  SubscriptionInsightSeverity,
  SubscriptionLifecycleState,
  SubscriptionRecommendationType
} from "@prisma/client";
import { SubscriptionRecommendationService } from "./subscription-recommendation.service";

const service = new SubscriptionRecommendationService();

test("recommendation reasons use user-facing language for low-detail scenarios", () => {
  const result = service.recommend({
    subscriptionId: "sub_1",
    lifecycleState: SubscriptionLifecycleState.ACTIVE,
    confidenceScore: 0.42,
    nextRenewalDate: new Date("2026-05-01T00:00:00.000Z"),
    insights: [
      {
        subscriptionId: "sub_1",
        insightType: "LOW_CONFIDENCE",
        title: "Needs review",
        description: "low confidence",
        severity: SubscriptionInsightSeverity.MEDIUM,
        confidence: 0.62,
        recommendedAction: "Review",
        metadata: {}
      }
    ],
    now: new Date("2026-04-08T00:00:00.000Z")
  });

  assert.equal(result.recommendationType, SubscriptionRecommendationType.REVIEW);
  assert.equal(result.reason.includes("signal"), false);
  assert.equal(result.reason.includes("lifecycle"), false);
});

test("duplicate recommendation avoids system-jargon wording", () => {
  const result = service.recommend({
    subscriptionId: "sub_2",
    lifecycleState: SubscriptionLifecycleState.ACTIVE,
    confidenceScore: 0.8,
    nextRenewalDate: null,
    insights: [
      {
        subscriptionId: "sub_2",
        insightType: "DUPLICATE_SUBSCRIPTION",
        title: "Duplicate",
        description: "duplicate",
        severity: SubscriptionInsightSeverity.HIGH,
        confidence: 0.85,
        recommendedAction: "Review",
        metadata: {}
      }
    ]
  });

  assert.equal(result.recommendationType, SubscriptionRecommendationType.REVIEW);
  assert.equal(result.reason.toLowerCase().includes("signal"), false);
  assert.equal(result.reason.toLowerCase().includes("deterministic"), false);
});
