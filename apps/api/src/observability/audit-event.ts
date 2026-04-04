import { Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { EventService } from "./event.service";

type DbClient = Prisma.TransactionClient | typeof prisma;

const eventService = new EventService();

export async function createAuditEvent(
  input: {
    userId: string;
    householdId?: string | null;
    obligationId?: string | null;
    eventType: string;
    metadata?: Prisma.InputJsonValue;
  },
  db?: DbClient
) {
  const client = db ?? prisma;

  const auditEvent = await client.auditEvent.create({
    data: {
      userId: input.userId,
      householdId: input.householdId ?? null,
      obligationId: input.obligationId ?? null,
      eventType: input.eventType,
      metadata: input.metadata
    }
  });

  const eventPayload = {
    id: auditEvent.id,
    userId: auditEvent.userId,
    householdId: auditEvent.householdId,
    obligationId: auditEvent.obligationId,
    eventType: auditEvent.eventType,
    metadata: auditEvent.metadata,
    createdAt: auditEvent.createdAt
  };

  if (db) {
    await eventService.emitFromAuditEvent(eventPayload, client);
  } else {
    void eventService.emitFromAuditEvent(eventPayload, client);
  }

  return auditEvent;
}
