import { FlowSessionState, ObligationStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import {
  FlowSessionRepository,
  type FlowSessionWithRelations
} from "../repositories/flow-session.repository";
import { ObligationRepository } from "../repositories/obligation.repository";
import { AppError } from "../utils/app-error";
import type {
  FlowSessionNextItem,
  FlowSessionPayload,
  FlowSourceContext
} from "../types/flow-session.types";

const createFlowSessionSchema = z.object({
  sessionId: z.string().min(1).optional(),
  sourceType: z.enum(["DAILY_PULSE", "TODAY_FEED", "DASHBOARD", "OBLIGATION_DETAIL"]),
  sourceContext: z.record(z.string(), z.unknown()).optional(),
  currentObligationId: z.string().min(1),
  currentJourneyId: z.string().min(1).optional(),
  reuseLatest: z.boolean().optional()
});

const completeStepSchema = z.object({
  obligationId: z.string().min(1).optional(),
  journeyId: z.string().min(1).optional()
});

const nextSchema = z.object({
  preferredObligationId: z.string().min(1).optional()
});

const HANDLED_STATUSES = new Set<ObligationStatus>([
  ObligationStatus.RESOLVED,
  ObligationStatus.IGNORED,
  ObligationStatus.POSTPONED
]);

export class FlowSessionService {
  private readonly repository = new FlowSessionRepository();
  private readonly obligationRepository = new ObligationRepository();

  async createOrResume(userId: string, payload: unknown) {
    const input = createFlowSessionSchema.parse(payload ?? {});
    const obligation = await this.obligationRepository.findById(input.currentObligationId, userId);
    if (!obligation) {
      throw new AppError("NOT_FOUND", "Obligation not found for flow session", 404);
    }

    const providedContext = normalizeSourceContext(input.sourceContext ?? null);
    const contextWithCurrent = ensureContextHasCurrentObligation(
      providedContext,
      input.currentObligationId
    );

    let session = input.sessionId
      ? await this.repository.findByIdForUser(userId, input.sessionId)
      : null;

    if (session && session.state !== FlowSessionState.ACTIVE) {
      session = null;
    }

    if (!session && (input.reuseLatest ?? true)) {
      const latest = await this.repository.findLatestActiveForSource(userId, input.sourceType);
      if (latest && shouldReuseSessionForObligation(latest.sourceContext, input.currentObligationId)) {
        session = latest;
      }
    }

    const savedSession = session
      ? await this.repository.update(session.id, {
          sourceType: input.sourceType,
          sourceContext: toJsonContext(
            mergeContexts(session.sourceContext, contextWithCurrent)
          ),
          currentObligationId: input.currentObligationId,
          currentJourneyId: input.currentJourneyId ?? null,
          state: FlowSessionState.ACTIVE
        })
      : await this.repository.create({
          userId,
          sourceType: input.sourceType,
          sourceContext: toJsonContext(contextWithCurrent),
          currentObligationId: input.currentObligationId,
          currentJourneyId: input.currentJourneyId ?? null
        });

    await this.repository.createAuditEvent({
      userId,
      obligationId: input.currentObligationId,
      eventType: session ? "flow_session_resumed" : "flow_session_created",
      metadata: {
        flowSessionId: savedSession.id,
        sourceType: input.sourceType
      }
    });

    return {
      session: await this.toPayload(userId, savedSession)
    };
  }

  async getById(userId: string, sessionId: string) {
    const session = await this.repository.findByIdForUser(userId, sessionId);
    if (!session) {
      throw new AppError("NOT_FOUND", "Flow session not found", 404);
    }

    return {
      session: await this.toPayload(userId, session)
    };
  }

  async completeStep(userId: string, sessionId: string, payload: unknown) {
    const input = completeStepSchema.parse(payload ?? {});
    const session = await this.requireActiveSession(userId, sessionId);

    const obligationId = input.obligationId ?? session.currentObligationId;
    if (!obligationId) {
      throw new AppError("INVALID_STATE", "Flow session has no current obligation", 409);
    }

    const existingContext = normalizeSourceContext(session.sourceContext);
    const handled = new Set(existingContext.handledObligationIds ?? []);
    handled.add(obligationId);

    const nextResolution = await this.resolveNext({
      userId,
      currentObligationId: session.currentObligationId ?? obligationId,
      context: {
        ...existingContext,
        handledObligationIds: Array.from(handled)
      }
    });

    const nextState =
      nextResolution.nextItem === null ? FlowSessionState.COMPLETED : FlowSessionState.ACTIVE;

    const updated = await this.repository.update(session.id, {
      sourceContext: toJsonContext({
        ...existingContext,
        handledObligationIds: Array.from(handled)
      }),
      currentJourneyId: input.journeyId ?? session.currentJourneyId,
      currentObligationId: obligationId,
      state: nextState
    });

    await this.repository.createAuditEvent({
      userId,
      obligationId,
      eventType: "flow_session_step_completed",
      metadata: {
        flowSessionId: session.id,
        nextObligationId: nextResolution.nextItem?.obligationId ?? null,
        state: nextState
      }
    });

    return {
      session: await this.toPayload(userId, updated)
    };
  }

  async next(userId: string, sessionId: string, payload: unknown) {
    const input = nextSchema.parse(payload ?? {});
    const session = await this.requireActiveSession(userId, sessionId);
    const context = normalizeSourceContext(session.sourceContext);

    const nextResolution = await this.resolveNext({
      userId,
      currentObligationId: input.preferredObligationId ?? session.currentObligationId,
      context
    });

    if (!nextResolution.nextItem) {
      const completed = await this.repository.update(session.id, {
        state: FlowSessionState.COMPLETED
      });

      await this.repository.createAuditEvent({
        userId,
        obligationId: session.currentObligationId,
        eventType: "flow_session_completed",
        metadata: {
          flowSessionId: session.id
        }
      });

      return {
        session: await this.toPayload(userId, completed)
      };
    }

    const updated = await this.repository.update(session.id, {
      currentObligationId: nextResolution.nextItem.obligationId,
      state: FlowSessionState.ACTIVE
    });

    await this.repository.createAuditEvent({
      userId,
      obligationId: nextResolution.nextItem.obligationId,
      eventType: "flow_session_moved_next",
      metadata: {
        flowSessionId: session.id
      }
    });

    return {
      session: await this.toPayload(userId, updated)
    };
  }

  async abandon(userId: string, sessionId: string) {
    const session = await this.repository.findByIdForUser(userId, sessionId);
    if (!session) {
      throw new AppError("NOT_FOUND", "Flow session not found", 404);
    }

    const updated = await this.repository.update(session.id, {
      state: FlowSessionState.ABANDONED
    });

    await this.repository.createAuditEvent({
      userId,
      obligationId: updated.currentObligationId,
      eventType: "flow_session_abandoned",
      metadata: {
        flowSessionId: updated.id
      }
    });

    return {
      session: await this.toPayload(userId, updated)
    };
  }

  private async requireActiveSession(userId: string, sessionId: string) {
    const session = await this.repository.findByIdForUser(userId, sessionId);
    if (!session) {
      throw new AppError("NOT_FOUND", "Flow session not found", 404);
    }

    if (session.state !== FlowSessionState.ACTIVE) {
      throw new AppError("INVALID_STATE", "Flow session is no longer active", 409);
    }

    return session;
  }

  private async toPayload(
    userId: string,
    session: FlowSessionWithRelations
  ): Promise<FlowSessionPayload> {
    const context = normalizeSourceContext(session.sourceContext);
    const withCurrent = ensureContextHasCurrentObligation(context, session.currentObligationId);
    const nextResolution = await this.resolveNext({
      userId,
      currentObligationId: session.currentObligationId,
      context: withCurrent
    });

    const totalItems = (withCurrent.obligationIds ?? []).length;
    const handledCount = nextResolution.handledCount;
    const remainingCount = Math.max(0, totalItems - handledCount);
    const progressPercent = totalItems === 0 ? 0 : Math.round((handledCount / totalItems) * 100);

    return {
      id: session.id,
      sourceType: session.sourceType,
      sourceContext: withCurrent,
      state: session.state,
      currentObligationId: session.currentObligationId,
      currentJourneyId: session.currentJourneyId,
      currentObligationTitle: session.currentObligation?.title ?? null,
      summary: {
        totalItems,
        handledCount,
        remainingCount,
        progressPercent
      },
      nextItem: nextResolution.nextItem,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString()
    };
  }

  private async resolveNext(input: {
    userId: string;
    currentObligationId: string | null | undefined;
    context: FlowSourceContext;
  }): Promise<{ nextItem: FlowSessionNextItem; handledCount: number }> {
    const obligationIds = uniqueIds(input.context.obligationIds ?? []);
    if (obligationIds.length === 0) {
      return {
        nextItem: null,
        handledCount: 0
      };
    }

    const obligations = await this.repository.listObligationsByIds(input.userId, obligationIds);
    const obligationById = new Map(obligations.map((item) => [item.id, item]));

    const handled = new Set(input.context.handledObligationIds ?? []);
    for (const obligation of obligations) {
      if (HANDLED_STATUSES.has(obligation.status)) {
        handled.add(obligation.id);
      }
    }

    const currentIndex =
      input.currentObligationId && obligationIds.includes(input.currentObligationId)
        ? obligationIds.indexOf(input.currentObligationId)
        : -1;

    const orderedAfterCurrent =
      currentIndex >= 0
        ? obligationIds.slice(currentIndex + 1)
        : obligationIds;
    const remainingInOrder = orderedAfterCurrent.filter((id) => !handled.has(id));
    const fallbackRemaining = obligationIds.filter((id) => !handled.has(id));

    const nextId = remainingInOrder[0] ?? fallbackRemaining[0] ?? null;

    return {
      nextItem: nextId
        ? {
            obligationId: nextId,
            title: obligationById.get(nextId)?.title ?? "Next item"
          }
        : null,
      handledCount: obligationIds.filter((id) => handled.has(id)).length
    };
  }
}

function normalizeSourceContext(value: unknown): FlowSourceContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      obligationIds: [],
      handledObligationIds: []
    };
  }

  const raw = value as Record<string, unknown>;

  return {
    label: typeof raw.label === "string" ? raw.label : undefined,
    returnPath: typeof raw.returnPath === "string" ? raw.returnPath : undefined,
    filterView: typeof raw.filterView === "string" ? raw.filterView : undefined,
    obligationIds: uniqueIds(asStringArray(raw.obligationIds)),
    handledObligationIds: uniqueIds(asStringArray(raw.handledObligationIds))
  };
}

function ensureContextHasCurrentObligation(
  context: FlowSourceContext,
  currentObligationId: string | null | undefined
) {
  if (!currentObligationId) return context;
  const nextIds = uniqueIds([...(context.obligationIds ?? []), currentObligationId]);
  return {
    ...context,
    obligationIds: nextIds
  };
}

function mergeContexts(existing: unknown, incoming: FlowSourceContext): FlowSourceContext {
  const left = normalizeSourceContext(existing);
  return {
    label: incoming.label ?? left.label,
    returnPath: incoming.returnPath ?? left.returnPath,
    filterView: incoming.filterView ?? left.filterView,
    obligationIds: uniqueIds([...(incoming.obligationIds ?? []), ...(left.obligationIds ?? [])]),
    handledObligationIds: uniqueIds([
      ...(incoming.handledObligationIds ?? []),
      ...(left.handledObligationIds ?? [])
    ])
  };
}

function shouldReuseSessionForObligation(context: unknown, obligationId: string) {
  const parsed = normalizeSourceContext(context);
  return parsed.obligationIds?.includes(obligationId) ?? false;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter((id) => id.length > 0)));
}

function toJsonContext(context: FlowSourceContext): Prisma.InputJsonValue {
  const sanitized: Record<string, unknown> = {};

  if (context.label) sanitized.label = context.label;
  if (context.returnPath) sanitized.returnPath = context.returnPath;
  if (context.filterView) sanitized.filterView = context.filterView;
  if (context.obligationIds && context.obligationIds.length > 0) {
    sanitized.obligationIds = context.obligationIds;
  }
  if (context.handledObligationIds && context.handledObligationIds.length > 0) {
    sanitized.handledObligationIds = context.handledObligationIds;
  }

  return sanitized as Prisma.InputJsonValue;
}
