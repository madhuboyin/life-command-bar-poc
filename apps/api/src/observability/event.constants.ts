export const OBSERVABILITY_EVENT_TYPES = {
  INGESTION_CREATED: "ingestion_created",
  INGESTION_CORRECTED: "ingestion_corrected",
  INGESTION_REJECTED: "ingestion_rejected",

  AUTH_SIGN_IN_STARTED: "auth_sign_in_started",
  AUTH_SIGN_IN_SUCCEEDED: "auth_sign_in_succeeded",
  AUTH_SIGN_IN_FAILED: "auth_sign_in_failed",
  AUTH_SIGN_OUT: "auth_sign_out",
  PROTECTED_ROUTE_REDIRECTED: "protected_route_redirected",

  GMAIL_CONNECTION_CREATED: "gmail_connection_created",
  GMAIL_CONNECTION_LINKED_TO_USER: "gmail_connection_linked_to_user",
  GMAIL_CONNECTION_DISCONNECTED: "gmail_connection_disconnected",
  GMAIL_SYNC_STARTED: "gmail_sync_started",
  GMAIL_SYNC_COMPLETED: "gmail_sync_completed",
  GMAIL_MESSAGE_MATCHED: "gmail_message_matched",
  GMAIL_CANDIDATE_CREATED: "gmail_candidate_created",
  GMAIL_CANDIDATE_REVIEWED: "gmail_candidate_reviewed",
  GMAIL_CANDIDATE_REJECTED: "gmail_candidate_rejected",
  GMAIL_DUPLICATE_SUPPRESSED: "gmail_duplicate_suppressed",
  GMAIL_PREDICTION_STRENGTHENED: "gmail_prediction_strengthened",
  GMAIL_SYNC_ERROR: "gmail_sync_error",
  GMAIL_SUBSCRIPTION_LIFECYCLE_CLASSIFIED: "gmail_subscription_lifecycle_classified",
  GMAIL_SUBSCRIPTION_LIFECYCLE_DETECTED: "gmail_subscription_lifecycle_detected",
  GMAIL_SUBSCRIPTION_AUTO_UPDATED: "gmail_subscription_auto_updated",
  GMAIL_SUBSCRIPTION_CANCELLATION_PROCESSED: "gmail_subscription_cancellation_processed",
  GMAIL_SUBSCRIPTION_CANDIDATE_CREATED: "gmail_subscription_candidate_created",
  GMAIL_SUBSCRIPTION_MATCHED_EXISTING: "gmail_subscription_matched_existing",
  GMAIL_SUBSCRIPTION_CONFLICT_DETECTED: "gmail_subscription_conflict_detected",
  GMAIL_SUBSCRIPTION_CANCELLATION_DETECTED: "gmail_subscription_cancellation_detected",
  GMAIL_SUBSCRIPTION_REVIEW_CONFIRMED: "gmail_subscription_review_confirmed",
  GMAIL_SUBSCRIPTION_REVIEW_REJECTED: "gmail_subscription_review_rejected",
  GMAIL_MESSAGE_CLASSIFIED_V2: "gmail_message_classified_v2",
  GMAIL_VENDOR_MATCHED: "gmail_vendor_matched",
  GMAIL_LIFECYCLE_LINKED: "gmail_lifecycle_linked",
  GMAIL_EXTRACTION_REVIEW: "gmail_extraction_review",
  GMAIL_LLM_FALLBACK_USED: "gmail_llm_fallback_used",
  GMAIL_SUPPRESSED: "gmail_suppressed",

  VENDOR_PROFILE_MATCHED: "vendor_profile_matched",
  VENDOR_PROFILE_UNKNOWN: "vendor_profile_unknown",
  VENDOR_PROFILE_CONFLICT: "vendor_profile_conflict",
  VENDOR_PROFILE_SUPPRESSED: "vendor_profile_suppressed",

  SUBSCRIPTION_REGISTRY_CREATED: "subscription_registry_created",
  SUBSCRIPTION_REGISTRY_UPDATED: "subscription_registry_updated",
  SUBSCRIPTION_REGISTRY_MERGED: "subscription_registry_merged",
  SUBSCRIPTION_REGISTRY_REVIEW_CONFIRMED: "subscription_registry_review_confirmed",
  SUBSCRIPTION_REGISTRY_REVIEW_REJECTED: "subscription_registry_review_rejected",
  SUBSCRIPTION_LIFECYCLE_TRANSITIONED: "subscription_lifecycle_transitioned",
  SUBSCRIPTION_PRICE_CHANGED: "subscription_price_changed",
  SUBSCRIPTION_CANCELLATION_DETECTED: "subscription_cancellation_detected",
  SUBSCRIPTION_PREDICTION_STRENGTHENED: "subscription_prediction_strengthened",
  SUBSCRIPTION_OBLIGATION_CREATED: "subscription_obligation_created",
  SUBSCRIPTION_INSIGHT_CREATED: "subscription_insight_created",
  SUBSCRIPTION_RECOMMENDATION_GENERATED: "subscription_recommendation_generated",
  SUBSCRIPTION_REVIEW_STARTED: "subscription_review_started",
  SUBSCRIPTION_DECISION_TAKEN: "subscription_decision_taken",
  SUBSCRIPTION_KEPT: "subscription_kept",
  SUBSCRIPTION_MARKED_FOR_CANCEL: "subscription_marked_for_cancel",
  SUBSCRIPTION_REGISTRY_UPDATE_SKIPPED: "subscription_registry_update_skipped",

  PREDICTION_CREATED: "prediction_created",
  PREDICTION_CONFIRMED: "prediction_confirmed",
  PREDICTION_DISMISSED: "prediction_dismissed",
  PREDICTION_PROMOTED: "prediction_promoted",

  AUTO_FLOW_TRIGGERED: "auto_flow_triggered",
  AUTO_FLOW_ACCEPTED: "auto_flow_accepted",
  AUTO_FLOW_DISMISSED: "auto_flow_dismissed",

  GUIDED_STARTED: "guided_started",
  GUIDED_STEP_COMPLETED: "guided_step_completed",
  GUIDED_COMPLETED: "guided_completed",
  GUIDED_ABANDONED: "guided_abandoned",

  OBLIGATION_CREATED: "obligation_created",
  OBLIGATION_COMPLETED: "obligation_completed",
  OBLIGATION_POSTPONED: "obligation_postponed",
  OBLIGATION_DISMISSED: "obligation_dismissed",

  REVIEW_REQUIRED: "review_required",
  REVIEW_CONFIRMED: "review_confirmed",
  REVIEW_REJECTED: "review_rejected",
  CORRECTION_APPLIED: "correction_applied",

  APPROVAL_REQUIRED: "approval_required",
  APPROVAL_APPROVED: "approval_approved",
  APPROVAL_REJECTED: "approval_rejected",

  AUTONOMY_ACTION_EXECUTED: "autonomy_action_executed",
  AUTONOMY_ACTION_UNDONE: "autonomy_action_undone",

  ASSIGNMENT_CHANGED: "assignment_changed",
  ITEM_CLAIMED: "item_claimed",
  ITEM_REASSIGNED: "item_reassigned",

  HOUSEHOLD_INVITE_ACCEPTED: "household_invite_accepted"
} as const;

export type ObservabilityEventType =
  (typeof OBSERVABILITY_EVENT_TYPES)[keyof typeof OBSERVABILITY_EVENT_TYPES];

export const EVENT_TYPE_SET = new Set<string>(Object.values(OBSERVABILITY_EVENT_TYPES));

export type TimeBucket = "DAY" | "WEEK" | "MONTH";

export const TIME_BUCKETS: TimeBucket[] = ["DAY", "WEEK", "MONTH"];
