import { z } from "zod";
import { prisma } from "../clients/prisma.client";
import { mapObligation } from "../utils/obligation.mapper";

const emailForwardSchema = z.object({
  userId: z.string().min(1),
  subject: z.string().min(1),
  from: z.string().min(1),
  bodyText: z.string().min(1)
});

function inferType(subject: string, bodyText: string) {
  const text = `${subject} ${bodyText}`.toLowerCase();

  if (text.includes("renew") || text.includes("expiration") || text.includes("expires")) {
    return "RENEWAL" as const;
  }

  if (text.includes("subscription") || text.includes("monthly plan") || text.includes("streaming")) {
    return "SUBSCRIPTION" as const;
  }

  if (text.includes("bill") || text.includes("payment due") || text.includes("statement")) {
    return "BILL" as const;
  }

  return "COMMITMENT" as const;
}

function inferTitle(subject: string) {
  return subject.trim().slice(0, 120);
}

export class ImportService {
  async importEmailForward(payload: unknown) {
    const input = emailForwardSchema.parse(payload);

    const type = inferType(input.subject, input.bodyText);
    const title = inferTitle(input.subject);

    const importSource = await prisma.importSource.create({
      data: {
        userId: input.userId,
        type: "EMAIL",
        rawData: {
          subject: input.subject,
          from: input.from,
          bodyText: input.bodyText
        }
      }
    });

    const obligation = await prisma.obligation.create({
      data: {
        userId: input.userId,
        type,
        title,
        description: `Imported from forwarded email: ${input.from}`,
        source: "EMAIL",
        status: "DRAFT",
        confidenceScore: 0.7,
        urgencyScore: 40,
        importanceScore: 45,
        effortLevel: "MEDIUM",
        impactLevel: "MEDIUM"
      }
    });

    await prisma.auditEvent.create({
      data: {
        userId: input.userId,
        obligationId: obligation.id,
        eventType: "email_forward_imported",
        metadata: {
          importSourceId: importSource.id,
          from: input.from,
          subject: input.subject
        }
      }
    });

    return {
      candidateObligationId: obligation.id,
      status: obligation.status,
      obligation: mapObligation(obligation)
    };
  }
}
