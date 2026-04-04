import { ExternalMessageIngestionStatus } from "@prisma/client";
import { IngestionResult } from "./ingestion.service";

export class GmailDedupeService {
  toMessageStatus(result: IngestionResult): ExternalMessageIngestionStatus {
    if (result.status === "DUPLICATE" || result.duplicateCandidate) {
      return ExternalMessageIngestionStatus.DUPLICATE_SUPPRESSED;
    }

    if (result.status === "NO_CANDIDATE") {
      return ExternalMessageIngestionStatus.SKIPPED;
    }

    if (result.needsReview || result.conflictDetected) {
      return ExternalMessageIngestionStatus.ROUTED_TO_REVIEW;
    }

    return ExternalMessageIngestionStatus.PROCESSED;
  }

  buildReason(result: IngestionResult): string | null {
    if (result.status === "DUPLICATE") {
      return result.duplicateOfObligationId
        ? `duplicate_of_obligation:${result.duplicateOfObligationId}`
        : "exact_or_structured_duplicate";
    }

    if (result.conflictDetected) {
      return result.conflictWithObligationId
        ? `conflict_with_obligation:${result.conflictWithObligationId}`
        : "conflicting_signal_detected";
    }

    if (result.status === "NO_CANDIDATE") {
      return "insufficient_signal";
    }

    if (result.needsReview) {
      return "needs_review";
    }

    return null;
  }
}
