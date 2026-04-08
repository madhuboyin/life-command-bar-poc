import type {
  ObligationIntelligenceClassified,
  ObligationIntelligenceExtracted,
  ObligationIntelligencePriority,
  ObligationIntelligenceRouting
} from "./obligation-intelligence.types";

type RouterInput = {
  classified: ObligationIntelligenceClassified;
  extracted: ObligationIntelligenceExtracted;
  priority: ObligationIntelligencePriority;
  conflictDetected: boolean;
  duplicateDetected: boolean;
};

export function routeObligationIntelligence(input: RouterInput): ObligationIntelligenceRouting {
  if (input.duplicateDetected) {
    return {
      route: "SUPPRESS",
      reason: "duplicate_detected",
      needsReview: false,
      suppress: true
    };
  }

  if (input.conflictDetected || input.extracted.conflictingSignals.length > 0) {
    return {
      route: "REVIEW",
      reason: "conflicting_signals",
      needsReview: true,
      suppress: false
    };
  }

  if (input.classified.confidenceBand === "LOW") {
    return {
      route: "REVIEW",
      reason: "low_confidence_requires_review",
      needsReview: true,
      suppress: false
    };
  }

  if (
    requiresDueDate(input.classified.obligationCategory) &&
    !input.extracted.paymentDueDate &&
    !input.extracted.dueDate &&
    !input.extracted.renewalDate
  ) {
    return {
      route: "REVIEW",
      reason: "missing_due_date_for_actionable_category",
      needsReview: true,
      suppress: false
    };
  }

  if (
    input.classified.obligationCategory === "UNKNOWN" &&
    input.classified.confidenceScore < 0.62
  ) {
    return {
      route: "REVIEW",
      reason: "unknown_category_requires_review",
      needsReview: true,
      suppress: false
    };
  }

  if (input.priority.recommendedSurfacingTarget === "SUPPRESS") {
    return {
      route: "SUPPRESS",
      reason: "low_priority_suppressed",
      needsReview: false,
      suppress: true
    };
  }

  if (input.priority.recommendedSurfacingTarget === "PULSE") {
    return {
      route: "PULSE",
      reason: "high_priority_for_pulse",
      needsReview: false,
      suppress: false
    };
  }

  if (input.priority.recommendedSurfacingTarget === "CONTROL_TOWER_READY") {
    return {
      route: "READY",
      reason: "ready_now_signal",
      needsReview: false,
      suppress: false
    };
  }

  if (input.priority.recommendedSurfacingTarget === "CONTROL_TOWER_REVIEW") {
    return {
      route: "REVIEW",
      reason: "review_target_recommended",
      needsReview: true,
      suppress: false
    };
  }

  return {
    route: "UPCOMING",
    reason: "upcoming_signal",
    needsReview: false,
    suppress: false
  };
}

function requiresDueDate(category: ObligationIntelligenceClassified["obligationCategory"]) {
  return (
    category === "BILL" ||
    category === "PAYMENT_DUE" ||
    category === "UTILITY" ||
    category === "TELECOM" ||
    category === "CREDIT_CARD" ||
    category === "LOAN" ||
    category === "INSURANCE" ||
    category === "SERVICE_RENEWAL"
  );
}

