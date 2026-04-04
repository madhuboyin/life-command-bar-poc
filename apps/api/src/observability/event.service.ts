import { Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { EVENT_TYPE_SET, type ObservabilityEventType } from "./event.constants";
import { mapAuditEventToObservability } from "./event-mapper";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type ObservabilityEventInput = {
  userId?: string | null;
  householdId?: string | null;
  eventType: ObservabilityEventType | string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  traceId?: string | null;
  correlationId?: string | null;
  timestamp?: Date;
  dedupeKey?: string | null;
  sourceAuditEventId?: string | null;
};

export type ObservabilityEventFilters = {
  userId?: string;
  householdId?: string;
  eventType?: string;
  entityType?: string;
  entityId?: string;
  traceId?: string;
  correlationId?: string;
  start?: Date;
  end?: Date;
  limit?: number;
  offset?: number;
};

export class EventService {
  async emit(input: ObservabilityEventInput, db?: DbClient) {
    const client = db ?? prisma;
    const normalizedEventType = normalizeEventType(input.eventType);

    try {
      return await client.observabilityEvent.create({
        data: {
          userId: input.userId ?? null,
          householdId: input.householdId ?? null,
          eventType: normalizedEventType,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          metadata: input.metadata,
          traceId: input.traceId ?? null,
          correlationId: input.correlationId ?? null,
          timestamp: input.timestamp ?? new Date(),
          dedupeKey: input.dedupeKey ?? null,
          sourceAuditEventId: input.sourceAuditEventId ?? null
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      // Observability is best-effort and must never block product flows.
      console.error("[observability:event] failed to emit", {
        eventType: normalizedEventType,
        entityType: input.entityType,
        entityId: input.entityId,
        error
      });
      return null;
    }
  }

  async emitFromAuditEvent(
    input: {
      id?: string;
      userId: string;
      householdId?: string | null;
      obligationId?: string | null;
      eventType: string;
      metadata?: Prisma.JsonValue | Prisma.InputJsonValue | null;
      createdAt?: Date;
    },
    db?: DbClient
  ) {
    const mapped = mapAuditEventToObservability(input);
    if (!mapped) {
      const metadata = asRecord(input.metadata) ?? {};
      const entityType =
        typeof metadata.decisionId === "string"
          ? "autonomy_decision"
          : typeof metadata.predictionId === "string"
            ? "prediction"
            : typeof metadata.journeyId === "string"
              ? "guided_journey"
              : typeof metadata.autoFlowStateId === "string"
                ? "auto_flow_state"
                : typeof metadata.importSourceId === "string"
                  ? "import_source"
                  : input.obligationId
                    ? "obligation"
                    : input.householdId
                      ? "household"
                      : null;

      const entityId =
        (typeof metadata.decisionId === "string" && metadata.decisionId) ||
        (typeof metadata.predictionId === "string" && metadata.predictionId) ||
        (typeof metadata.journeyId === "string" && metadata.journeyId) ||
        (typeof metadata.autoFlowStateId === "string" && metadata.autoFlowStateId) ||
        (typeof metadata.importSourceId === "string" && metadata.importSourceId) ||
        input.obligationId ||
        input.householdId ||
        null;

      const correlationId =
        (typeof metadata.correlationId === "string" && metadata.correlationId) ||
        (typeof metadata.importSourceId === "string" && metadata.importSourceId) ||
        (typeof metadata.predictionId === "string" && metadata.predictionId) ||
        (typeof metadata.decisionId === "string" && metadata.decisionId) ||
        input.obligationId ||
        input.householdId ||
        null;

      return this.emit(
        {
          userId: input.userId,
          householdId: input.householdId ?? null,
          eventType: input.eventType,
          entityType,
          entityId,
          metadata: {
            ...metadata,
            originalEventType: input.eventType,
            sourceAuditEventId: input.id ?? null,
            mappedAt: new Date().toISOString()
          },
          traceId:
            (typeof metadata.traceId === "string" && metadata.traceId) ||
            (entityType && entityId ? `${entityType}:${entityId}` : correlationId ? `corr:${correlationId}` : null),
          correlationId,
          timestamp: input.createdAt ?? new Date(),
          dedupeKey: input.id ? `audit:${input.id}` : null,
          sourceAuditEventId: input.id ?? null
        },
        db
      );
    }

    return this.emit(
      {
        userId: input.userId,
        householdId: input.householdId ?? null,
        eventType: mapped.eventType,
        entityType: mapped.entityType,
        entityId: mapped.entityId,
        metadata: mapped.metadata,
        traceId: mapped.traceId,
        correlationId: mapped.correlationId,
        timestamp: mapped.timestamp,
        dedupeKey: input.id ? `audit:${input.id}` : null,
        sourceAuditEventId: input.id ?? null
      },
      db
    );
  }

  async list(filters: ObservabilityEventFilters) {
    const limit = clamp(filters.limit ?? 100, 1, 500);
    const offset = Math.max(0, filters.offset ?? 0);

    const where: Prisma.ObservabilityEventWhereInput = {
      userId: filters.userId,
      householdId: filters.householdId,
      eventType: filters.eventType,
      entityType: filters.entityType,
      entityId: filters.entityId,
      traceId: filters.traceId,
      correlationId: filters.correlationId,
      timestamp:
        filters.start || filters.end
          ? {
              gte: filters.start,
              lte: filters.end
            }
          : undefined
    };

    const [items, total] = await Promise.all([
      prisma.observabilityEvent.findMany({
        where,
        orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }],
        skip: offset,
        take: limit
      }),
      prisma.observabilityEvent.count({ where })
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        userId: item.userId,
        householdId: item.householdId,
        eventType: item.eventType,
        entityType: item.entityType,
        entityId: item.entityId,
        metadata: asRecord(item.metadata),
        traceId: item.traceId,
        correlationId: item.correlationId,
        sourceAuditEventId: item.sourceAuditEventId,
        timestamp: item.timestamp.toISOString()
      })),
      pagination: {
        limit,
        offset,
        total
      }
    };
  }
}

function normalizeEventType(eventType: string) {
  const normalized = eventType.trim();
  if (EVENT_TYPE_SET.has(normalized)) return normalized;
  return normalized.length > 0 ? normalized : "unknown_event";
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
