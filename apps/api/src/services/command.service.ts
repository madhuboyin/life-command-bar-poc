import { z } from "zod";
import { TodayFeedService } from "./today-feed.service";
import { ResolutionService } from "./resolution.service";
import { ObligationRepository } from "../repositories/obligation.repository";
import { mapObligation } from "../utils/obligation.mapper";
import { IngestionService } from "./ingestion.service";

const commandSchema = z.object({
  input: z.string().min(1),
  context: z
    .object({
      obligationId: z.string().optional()
    })
    .optional()
});

export class CommandService {
  private readonly todayFeedService = new TodayFeedService();
  private readonly resolutionService = new ResolutionService();
  private readonly obligationRepository = new ObligationRepository();
  private readonly ingestionService = new IngestionService();

  parse(payload: unknown) {
    const input = commandSchema.parse(payload);

    const text = input.input.trim().toLowerCase();

    const todayPatterns = [
      "what do i need to handle today",
      "today",
      "what should i handle today"
    ];

    const upcomingPatterns = [
      "what's coming up this week",
      "upcoming",
      "upcoming bills"
    ];

    const resolutionPatterns = [
      "help me handle this",
      "what should i do about this",
      "prepare to cancel",
      "is this worth keeping",
      "walk me through this"
    ];

    if (todayPatterns.some((p) => text.includes(p))) {
      return {
        intent: "awareness",
        confidence: 0.96,
        entities: {},
        resolution: {
          type: "today_feed"
        },
        needsClarification: false
      };
    }

    if (upcomingPatterns.some((p) => text.includes(p))) {
      return {
        intent: "awareness",
        confidence: 0.9,
        entities: {},
        resolution: {
          type: "obligation_list"
        },
        needsClarification: false
      };
    }

    if (resolutionPatterns.some((p) => text.includes(p))) {
      if (input.context?.obligationId) {
        return {
          intent: "resolution_guidance",
          confidence: 0.92,
          entities: {},
          resolution: {
            type: "existing_obligation",
            obligationId: input.context.obligationId
          },
          needsClarification: false
        };
      }

      return {
        intent: "clarification",
        confidence: 0.65,
        entities: {},
        resolution: {
          type: "clarification"
        },
        needsClarification: true,
        question: "Which obligation did you mean?"
      };
    }

    if (text.startsWith("track ")) {
      return {
        intent: "tracking",
        confidence: 0.85,
        entities: {
          rawTitle: input.input.replace(/^track\s+/i, "").trim()
        },
        resolution: {
          type: "new_obligation_candidate"
        },
        needsClarification: false
      };
    }

    const ingestionHints = [
      "renew",
      "subscription",
      "bill",
      "invoice",
      "payment due",
      "remind me",
      "submit",
      "expires"
    ];

    if (
      ingestionHints.some((hint) => text.includes(hint)) ||
      /\$\s*\d+/.test(text) ||
      /\bdue\b/.test(text)
    ) {
      return {
        intent: "tracking",
        confidence: 0.74,
        entities: {
          rawTitle: input.input.trim()
        },
        resolution: {
          type: "new_obligation_candidate"
        },
        needsClarification: false
      };
    }

    return {
      intent: "clarification",
      confidence: 0.5,
      entities: {},
      resolution: {
        type: "clarification"
      },
      needsClarification: true,
      question:
        "I can help with today’s feed, obligation tracking, or resolution guidance. What would you like to do?"
    };
  }

  async execute(userId: string, payload: unknown) {
    const parsed = this.parse(payload);

    if (parsed.resolution.type === "today_feed") {
      const feed = await this.todayFeedService.getTodayFeed(userId);
      return {
        resultType: "today_feed",
        ...feed
      };
    }

    if (parsed.resolution.type === "obligation_list") {
      const obligations = await this.obligationRepository.findMany({
        userId,
        limit: 20,
        offset: 0
      });

      return {
        resultType: "obligation_list",
        items: obligations.items.map(mapObligation),
        pagination: {
          total: obligations.total,
          limit: obligations.limit,
          offset: obligations.offset
        }
      };
    }

    if (
      parsed.resolution.type === "existing_obligation" &&
      parsed.resolution.obligationId
    ) {
      const resolution = await this.resolutionService.getResolution(
        userId,
        parsed.resolution.obligationId
      );

      return {
        resultType: "resolution_flow",
        ...resolution
      };
    }

    if (parsed.resolution.type === "new_obligation_candidate") {
      const rawPayloadInput =
        typeof (payload as { input?: unknown })?.input === "string"
          ? ((payload as { input: string }).input ?? "")
          : "";

      const ingestion = await this.ingestionService.ingestCommandCapture({
        userId,
        input: (parsed.entities.rawTitle as string | undefined) ?? rawPayloadInput
      });

      return {
        resultType: "ingestion_candidate",
        ingestion
      };
    }

    return {
      resultType: "clarification",
      question:
        parsed.question ??
        "I could not determine your intent. Try asking for today’s feed or resolution help."
    };
  }

  async ingest(userId: string, payload: unknown) {
    return this.ingestionService.ingestCommandCapture({
      ...((payload ?? {}) as Record<string, unknown>),
      userId
    });
  }
}
