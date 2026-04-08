import type {
  BehaviorProfileComputationInput,
  BehaviorSignalInput,
  BehaviorSignalSummaryRequest,
  BehaviorSignalSummaryResult
} from "../types/behavior-profile.types";
import { buildEmptyBehaviorSignalSummary } from "../types/behavior-profile.types";

/**
 * Step 1 scaffolding only.
 *
 * Future phases will connect this service to persistent behavioral signal ingestion.
 * The intended signal categories include:
 * - item impressions
 * - direct actions
 * - defer/remind-later choices
 * - untouched items
 * - details opened before action
 * - "why this?" opened
 * - review flow started/completed
 * - time-to-first-action and time-to-action metrics
 */
export class PersonalizationSignalService {
  async recordBehaviorSignal(_input: BehaviorSignalInput): Promise<void> {
    // Intentionally no-op in Step 1. Signal ingestion will be added in a later phase.
    return;
  }

  async recordBehaviorSignals(_input: BehaviorSignalInput[]): Promise<void> {
    // Intentionally no-op in Step 1. Batch ingestion is reserved for later phases.
    return;
  }

  async summarizeBehaviorSignals(
    input: BehaviorSignalSummaryRequest
  ): Promise<BehaviorSignalSummaryResult> {
    return {
      userId: input.userId,
      sampleSize: 0,
      signals: buildEmptyBehaviorSignalSummary(),
      windowStart: input.windowStart ?? null,
      windowEnd: input.windowEnd ?? null
    };
  }

  async buildComputationInput(input: {
    userId: string;
    windowStart?: Date;
    windowEnd?: Date;
  }): Promise<BehaviorProfileComputationInput> {
    const summary = await this.summarizeBehaviorSignals({
      userId: input.userId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd
    });

    return {
      userId: summary.userId,
      sampleSize: summary.sampleSize,
      signals: summary.signals
    };
  }
}
