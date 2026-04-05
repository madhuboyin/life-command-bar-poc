import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

export async function logAuthEvent(input: {
  userId?: string | null;
  eventType:
    | "auth_sign_in_succeeded"
    | "auth_sign_in_started"
    | "auth_sign_in_failed"
    | "auth_sign_out"
    | "protected_route_redirected"
    | "gmail_connection_linked_to_user"
    | "gmail_connection_disconnected"
    | "household_invite_accepted";
  metadata?: Prisma.InputJsonValue;
}) {
  const metadata = input.metadata ?? ({} as Prisma.InputJsonObject);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (input.userId) {
      await tx.auditEvent.create({
        data: {
          userId: input.userId,
          eventType: input.eventType,
          metadata
        }
      });
    }
    await tx.observabilityEvent.create({
      data: {
        userId: input.userId ?? null,
        eventType: input.eventType,
        entityType: "auth",
        entityId: input.userId ?? null,
        metadata,
        timestamp: new Date()
      }
    });
  }).catch(() => null);
}
