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

    case "gmail_connection_created":
      return OBSERVABILITY_EVENT_TYPES.GMAIL_CONNECTION_CREATED;
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
