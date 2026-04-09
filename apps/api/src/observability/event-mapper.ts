import { Prisma } from "@prisma/client";
import {
  OBSERVABILITY_EVENT_TYPES,
  type ObservabilityEventType
} from "./event.constants";

type AuditEventInput = {
  id?: string;
  userId: string;
  householdId?: string | null;
  obligationId?: string | null;
  eventType: string;
  metadata?: Prisma.JsonValue | Prisma.InputJsonValue | null;
  createdAt?: Date;
};

export type MappedObservabilityEvent = {
  eventType: ObservabilityEventType;
  entityType: string | null;
  entityId: string | null;
  metadata: Prisma.InputJsonValue;
  traceId: string | null;
  correlationId: string | null;
  timestamp: Date;
};

export function mapAuditEventToObservability(
  input: AuditEventInput
): MappedObservabilityEvent | null {
  const metadata = asRecord(input.metadata) ?? {};
  const mappedEventType = mapEventType(input.eventType, metadata);
  if (!mappedEventType) return null;

  const entity = resolveEntity(input, metadata);
  const correlationId =
    getString(metadata.correlationId) ??
    getString(metadata.importSourceId) ??
    getString(metadata.predictionId) ??
    getString(metadata.decisionId) ??
    getString(metadata.journeyId) ??
    getString(metadata.autoFlowStateId) ??
    getString(metadata.reminderId) ??
    input.obligationId ??
    input.householdId ??
    null;

  const traceId =
    getString(metadata.traceId) ??
    buildTraceId({
      entityType: entity.entityType,
      entityId: entity.entityId,
      correlationId
    });

  return {
    eventType: mappedEventType,
    entityType: entity.entityType,
    entityId: entity.entityId,
    metadata: {
      ...metadata,
      originalEventType: input.eventType,
      sourceAuditEventId: input.id ?? null,
      mappedAt: new Date().toISOString()
    },
    traceId,
    correlationId,
    timestamp: input.createdAt ?? new Date()
  };
}

function mapEventType(
  auditEventType: string,
  metadata: Record<string, unknown>
): ObservabilityEventType | null {
  switch (auditEventType) {
    case "ingestion_input_received":
    case "ingestion_classified":
    case "ingestion_extracted":
    case "ingestion_candidate_created":
    case "upload_ingestion_completed":
      return OBSERVABILITY_EVENT_TYPES.INGESTION_CREATED;
    case "ingestion_candidate_confirmed":
      return OBSERVABILITY_EVENT_TYPES.INGESTION_CORRECTED;
    case "ingestion_candidate_rejected":
    case "ingestion_duplicate_detected":
    case "ingestion_structured_duplicate_detected":
    case "upload_ingestion_failed":
      return OBSERVABILITY_EVENT_TYPES.INGESTION_REJECTED;

    case "auth_sign_in_started":
      return OBSERVABILITY_EVENT_TYPES.AUTH_SIGN_IN_STARTED;
    case "auth_sign_in_succeeded":
      return OBSERVABILITY_EVENT_TYPES.AUTH_SIGN_IN_SUCCEEDED;
    case "auth_sign_in_failed":
      return OBSERVABILITY_EVENT_TYPES.AUTH_SIGN_IN_FAILED;
    case "auth_sign_out":
      return OBSERVABILITY_EVENT_TYPES.AUTH_SIGN_OUT;
    case "protected_route_redirected":
      return OBSERVABILITY_EVENT_TYPES.PROTECTED_ROUTE_REDIRECTED;

    case "gmail_connection_created":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_CONNECTION_CREATED;
    case "gmail_connection_linked_to_user":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_CONNECTION_LINKED_TO_USER;
    case "gmail_connection_disconnected":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_CONNECTION_DISCONNECTED;
    case "gmail_sync_started":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SYNC_STARTED;
    case "gmail_sync_completed":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SYNC_COMPLETED;
    case "gmail_message_matched":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_MESSAGE_MATCHED;
    case "gmail_candidate_created":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_CANDIDATE_CREATED;
    case "gmail_candidate_reviewed":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_CANDIDATE_REVIEWED;
    case "gmail_candidate_rejected":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_CANDIDATE_REJECTED;
    case "gmail_duplicate_suppressed":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_DUPLICATE_SUPPRESSED;
    case "gmail_prediction_strengthened":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_PREDICTION_STRENGTHENED;
    case "gmail_sync_error":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SYNC_ERROR;
    case "gmail_subscription_lifecycle_classified":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SUBSCRIPTION_LIFECYCLE_CLASSIFIED;
    case "gmail_subscription_lifecycle_detected":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SUBSCRIPTION_LIFECYCLE_DETECTED;
    case "gmail_subscription_auto_updated":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SUBSCRIPTION_AUTO_UPDATED;
    case "gmail_subscription_cancellation_processed":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SUBSCRIPTION_CANCELLATION_PROCESSED;
    case "gmail_subscription_candidate_created":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SUBSCRIPTION_CANDIDATE_CREATED;
    case "gmail_subscription_matched_existing":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SUBSCRIPTION_MATCHED_EXISTING;
    case "gmail_subscription_conflict_detected":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SUBSCRIPTION_CONFLICT_DETECTED;
    case "gmail_subscription_cancellation_detected":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SUBSCRIPTION_CANCELLATION_DETECTED;
    case "gmail_subscription_review_confirmed":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SUBSCRIPTION_REVIEW_CONFIRMED;
    case "gmail_subscription_review_rejected":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SUBSCRIPTION_REVIEW_REJECTED;
    case "gmail_message_classified_v2":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_MESSAGE_CLASSIFIED_V2;
    case "gmail_vendor_matched":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_VENDOR_MATCHED;
    case "gmail_lifecycle_linked":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_LIFECYCLE_LINKED;
    case "gmail_extraction_review":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_EXTRACTION_REVIEW;
    case "gmail_llm_fallback_used":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_LLM_FALLBACK_USED;
    case "gmail_suppressed":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_SUPPRESSED;

    case "llm_call_requested":
      return OBSERVABILITY_EVENT_TYPES.LLM_CALL_REQUESTED;
    case "llm_call_skipped_by_gate":
      return OBSERVABILITY_EVENT_TYPES.LLM_CALL_SKIPPED_BY_GATE;
    case "llm_cache_hit":
      return OBSERVABILITY_EVENT_TYPES.LLM_CACHE_HIT;
    case "llm_cache_miss":
      return OBSERVABILITY_EVENT_TYPES.LLM_CACHE_MISS;
    case "llm_provider_prompt_cache_hit_if_available":
      return OBSERVABILITY_EVENT_TYPES.LLM_PROVIDER_PROMPT_CACHE_HIT_IF_AVAILABLE;
    case "llm_call_completed":
      return OBSERVABILITY_EVENT_TYPES.LLM_CALL_COMPLETED;
    case "llm_call_failed":
      return OBSERVABILITY_EVENT_TYPES.LLM_CALL_FAILED;
    case "llm_budget_soft_limit_hit":
      return OBSERVABILITY_EVENT_TYPES.LLM_BUDGET_SOFT_LIMIT_HIT;
    case "llm_model_routed":
      return OBSERVABILITY_EVENT_TYPES.LLM_MODEL_ROUTED;
    case "llm_async_task_enqueued":
      return OBSERVABILITY_EVENT_TYPES.LLM_ASYNC_TASK_ENQUEUED;

    case "vendor_profile_matched":
      return OBSERVABILITY_EVENT_TYPES.VENDOR_PROFILE_MATCHED;
    case "vendor_profile_unknown":
      return OBSERVABILITY_EVENT_TYPES.VENDOR_PROFILE_UNKNOWN;
    case "vendor_profile_conflict":
      return OBSERVABILITY_EVENT_TYPES.VENDOR_PROFILE_CONFLICT;
    case "vendor_profile_suppressed":
      return OBSERVABILITY_EVENT_TYPES.VENDOR_PROFILE_SUPPRESSED;
    case "subscription_registry_created":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REGISTRY_CREATED;
    case "subscription_registry_updated":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REGISTRY_UPDATED;
    case "subscription_registry_merged":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REGISTRY_MERGED;
    case "subscription_registry_review_confirmed":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REGISTRY_REVIEW_CONFIRMED;
    case "subscription_registry_review_rejected":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REGISTRY_REVIEW_REJECTED;
    case "subscription_lifecycle_transitioned":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_LIFECYCLE_TRANSITIONED;
    case "subscription_price_changed":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_PRICE_CHANGED;
    case "subscription_cancellation_detected":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_CANCELLATION_DETECTED;
    case "subscription_prediction_strengthened":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_PREDICTION_STRENGTHENED;
    case "subscription_obligation_created":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_OBLIGATION_CREATED;
    case "subscription_insight_created":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_INSIGHT_CREATED;
    case "subscription_recommendation_generated":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_RECOMMENDATION_GENERATED;
    case "subscription_review_started":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REVIEW_STARTED;
    case "subscription_review_hub_loaded":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REVIEW_HUB_LOADED;
    case "subscription_review_hub_empty":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REVIEW_HUB_EMPTY;
    case "subscription_review_item_opened":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REVIEW_ITEM_OPENED;
    case "subscription_review_keep_selected":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REVIEW_KEEP_SELECTED;
    case "subscription_review_cancel_selected":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REVIEW_CANCEL_SELECTED;
    case "subscription_review_remind_selected":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REVIEW_REMIND_SELECTED;
    case "subscription_review_details_opened":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REVIEW_DETAILS_OPENED;
    case "subscription_review_completed":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REVIEW_COMPLETED;
    case "subscription_review_guided_flow_handoff":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REVIEW_GUIDED_FLOW_HANDOFF;
    case "subscription_decision_taken":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_DECISION_TAKEN;
    case "subscription_kept":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_KEPT;
    case "subscription_marked_for_cancel":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_MARKED_FOR_CANCEL;
    case "subscription_registry_update_skipped":
      return OBSERVABILITY_EVENT_TYPES.SUBSCRIPTION_REGISTRY_UPDATE_SKIPPED;

    case "anchor_created":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_CREATED;
    case "anchor_updated":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_UPDATED;
    case "anchor_cancelled":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_CANCELLED;
    case "anchor_snoozed":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_SNOOZED;
    case "anchor_surfaced":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_SURFACED;
    case "anchor_action_completed":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_ACTION_COMPLETED;
    case "anchor_confirmed_by_gmail":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_CONFIRMED_BY_GMAIL;
    case "anchor_timing_refined":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_TIMING_REFINED;
    case "anchor_candidate_suppressed_by_dedupe":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_CANDIDATE_SUPPRESSED_BY_DEDUPE;
    case "anchor_candidate_merged":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_CANDIDATE_MERGED;
    case "anchor_fallback_used":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_FALLBACK_USED;
    case "anchor_matching_failed":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_MATCHING_FAILED;
    case "anchor_matching_ambiguous":
      return OBSERVABILITY_EVENT_TYPES.ANCHOR_MATCHING_AMBIGUOUS;

    case "prediction_rebuilt":
    case "prediction_updated":
      return OBSERVABILITY_EVENT_TYPES.PREDICTION_CREATED;
    case "prediction_confirmed":
    case "prediction_resolved_by_ingestion":
      return OBSERVABILITY_EVENT_TYPES.PREDICTION_CONFIRMED;
    case "prediction_dismissed":
      return OBSERVABILITY_EVENT_TYPES.PREDICTION_DISMISSED;
    case "prediction_promoted_to_obligation":
      return OBSERVABILITY_EVENT_TYPES.PREDICTION_PROMOTED;

    case "auto_flow_triggered":
      return OBSERVABILITY_EVENT_TYPES.AUTO_FLOW_TRIGGERED;
    case "auto_flow_accepted":
      return OBSERVABILITY_EVENT_TYPES.AUTO_FLOW_ACCEPTED;
    case "auto_flow_dismissed":
      return OBSERVABILITY_EVENT_TYPES.AUTO_FLOW_DISMISSED;

    case "guided_journey_created":
    case "guided_journey_resumed":
      return OBSERVABILITY_EVENT_TYPES.GUIDED_STARTED;
    case "guided_journey_step_completed":
      return OBSERVABILITY_EVENT_TYPES.GUIDED_STEP_COMPLETED;
    case "guided_journey_completed":
      return OBSERVABILITY_EVENT_TYPES.GUIDED_COMPLETED;
    case "guided_journey_abandoned":
    case "guided_journey_dismissed":
      return OBSERVABILITY_EVENT_TYPES.GUIDED_ABANDONED;

    case "obligation_created":
      return OBSERVABILITY_EVENT_TYPES.OBLIGATION_CREATED;
    case "obligation_marked_done":
      return OBSERVABILITY_EVENT_TYPES.OBLIGATION_COMPLETED;
    case "obligation_postponed":
      return OBSERVABILITY_EVENT_TYPES.OBLIGATION_POSTPONED;
    case "obligation_dismissed":
      return OBSERVABILITY_EVENT_TYPES.OBLIGATION_DISMISSED;

    case "ingestion_candidate_skipped":
      return OBSERVABILITY_EVENT_TYPES.REVIEW_REQUIRED;
    case "obligation_corrected":
      return OBSERVABILITY_EVENT_TYPES.CORRECTION_APPLIED;

    case "zero_input_approval_approved":
      return OBSERVABILITY_EVENT_TYPES.APPROVAL_APPROVED;
    case "zero_input_approval_rejected":
      return OBSERVABILITY_EVENT_TYPES.APPROVAL_REJECTED;
    case "zero_input_decision_undone":
      return OBSERVABILITY_EVENT_TYPES.AUTONOMY_ACTION_UNDONE;

    case "obligation_assignment_changed":
    case "obligation_assigned":
    case "obligation_unassigned":
    case "household_member_removed":
      return OBSERVABILITY_EVENT_TYPES.ASSIGNMENT_CHANGED;
    case "obligation_claimed":
      return OBSERVABILITY_EVENT_TYPES.ITEM_CLAIMED;
    case "obligation_handed_off":
      return OBSERVABILITY_EVENT_TYPES.ITEM_REASSIGNED;
    case "household_invite_accepted":
      return OBSERVABILITY_EVENT_TYPES.HOUSEHOLD_INVITE_ACCEPTED;
    case "behavior_signal_recorded":
      return OBSERVABILITY_EVENT_TYPES.BEHAVIOR_SIGNAL_RECORDED;
    case "behavior_profile_recomputed":
      return OBSERVABILITY_EVENT_TYPES.BEHAVIOR_PROFILE_RECOMPUTED;
    case "behavior_profile_insufficient_data":
      return OBSERVABILITY_EVENT_TYPES.BEHAVIOR_PROFILE_INSUFFICIENT_DATA;
    case "behavior_profile_changed":
      return OBSERVABILITY_EVENT_TYPES.BEHAVIOR_PROFILE_CHANGED;
    case "personalization_adjustment_applied":
      return OBSERVABILITY_EVENT_TYPES.PERSONALIZATION_ADJUSTMENT_APPLIED;
    case "today_view_personalization_applied":
      return OBSERVABILITY_EVENT_TYPES.TODAY_VIEW_PERSONALIZATION_APPLIED;
    case "today_view_personalization_skipped":
      return OBSERVABILITY_EVENT_TYPES.TODAY_VIEW_PERSONALIZATION_SKIPPED;
    case "adaptive_message_style_applied":
      return OBSERVABILITY_EVENT_TYPES.ADAPTIVE_MESSAGE_STYLE_APPLIED;
    case "reminder_style_applied":
      return OBSERVABILITY_EVENT_TYPES.REMINDER_STYLE_APPLIED;
    case "personalization_fallback_used":
      return OBSERVABILITY_EVENT_TYPES.PERSONALIZATION_FALLBACK_USED;
    case "personalization_error_recovered":
      return OBSERVABILITY_EVENT_TYPES.PERSONALIZATION_ERROR_RECOVERED;

    case "zero_input_decision_recorded": {
      const decision = getString(metadata.decision);
      if (decision === "APPROVAL_REQUIRED") {
        return OBSERVABILITY_EVENT_TYPES.APPROVAL_REQUIRED;
      }
      if (decision === "REVIEW") {
        return OBSERVABILITY_EVENT_TYPES.REVIEW_REQUIRED;
      }
      if (decision === "EXECUTED") {
        return OBSERVABILITY_EVENT_TYPES.AUTONOMY_ACTION_EXECUTED;
      }
      return null;
    }

    case "zero_input_prediction_promoted":
      return OBSERVABILITY_EVENT_TYPES.AUTONOMY_ACTION_EXECUTED;

    default:
      return null;
  }
}

function resolveEntity(
  input: {
    obligationId?: string | null;
    householdId?: string | null;
  },
  metadata: Record<string, unknown>
) {
  const decisionId = getString(metadata.decisionId);
  if (decisionId) {
    return { entityType: "autonomy_decision", entityId: decisionId };
  }

  const predictionId = getString(metadata.predictionId);
  if (predictionId) {
    return { entityType: "prediction", entityId: predictionId };
  }

  const journeyId = getString(metadata.journeyId);
  if (journeyId) {
    return { entityType: "guided_journey", entityId: journeyId };
  }

  const autoFlowStateId = getString(metadata.autoFlowStateId);
  if (autoFlowStateId) {
    return { entityType: "auto_flow_state", entityId: autoFlowStateId };
  }

  const importSourceId = getString(metadata.importSourceId);
  if (importSourceId) {
    return { entityType: "import_source", entityId: importSourceId };
  }

  const subscriptionId = getString(metadata.subscriptionId);
  if (subscriptionId) {
    return { entityType: "subscription_registry", entityId: subscriptionId };
  }

  const reminderId = getString(metadata.reminderId);
  if (reminderId) {
    return { entityType: "reminder", entityId: reminderId };
  }

  if (input.obligationId) {
    return { entityType: "obligation", entityId: input.obligationId };
  }

  if (input.householdId) {
    return { entityType: "household", entityId: input.householdId };
  }

  return { entityType: null, entityId: null };
}

function buildTraceId(input: {
  entityType: string | null;
  entityId: string | null;
  correlationId: string | null;
}) {
  if (input.entityType && input.entityId) {
    return `${input.entityType}:${input.entityId}`;
  }

  if (input.correlationId) {
    return `corr:${input.correlationId}`;
  }

  return null;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
