import { z } from "zod";
import { ObligationRepository } from "../repositories/obligation.repository";
import { mapObligation } from "../utils/obligation.mapper";

const createObligationSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(["BILL", "SUBSCRIPTION", "RENEWAL", "COMMITMENT"]),
  title: z.string().min(1),
  description: z.string().optional(),
  vendor: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().length(3).optional(),
  dueDate: z.string().datetime().optional(),
  recurrence: z.string().optional(),
  source: z.enum(["MANUAL", "EMAIL", "DOCUMENT", "INFERRED"]).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  urgencyScore: z.number().min(0).max(100).optional(),
  importanceScore: z.number().min(0).max(100).optional(),
  effortLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  impactLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "POSTPONED", "RESOLVED", "IGNORED"]).optional()
});

export class ObligationService {
  private readonly repository = new ObligationRepository();

  async list(userId: string, query: Record<string, unknown>) {
    const result = await this.repository.findMany({
      userId,
      status: typeof query.status === "string" ? query.status : undefined,
      type: typeof query.type === "string" ? query.type : undefined,
      limit: typeof query.limit === "string" ? Number(query.limit) : 20,
      offset: typeof query.offset === "string" ? Number(query.offset) : 0
    });

    return {
      items: result.items.map(mapObligation),
      pagination: {
        limit: result.limit,
        offset: result.offset,
        total: result.total
      }
    };
  }

  async getById(userId: string, id: string) {
    const obligation = await this.repository.findById(id, userId);
    if (!obligation) return null;
    return mapObligation(obligation);
  }

  async create(payload: unknown) {
    const input = createObligationSchema.parse(payload);
    const obligation = await this.repository.create(input);
    return mapObligation(obligation);
  }
}
