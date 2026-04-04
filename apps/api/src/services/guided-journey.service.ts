import {
  GuidedJourneyEventType,
  GuidedJourneyInputType,
  GuidedJourneyStatus,
  ObligationStatus,
  OutcomeSourceContext,
  OutcomeType,
  Prisma
} from "@prisma/client";
import { z } from "zod";
import {
  GuidedJourneyRepository,
  type GuidedJourneyWithRelations
} from "../repositories/guided-journey.repository";
import { AppError } from "../utils/app-error";
import { mapObligation } from "../utils/obligation.mapper";
import {
  buildGuidedJourneyTemplate,
  normalizeTemplateSteps
} from "./guided-journey.builder";
import { PersonalizationService } from "./personalization.service";
import { DailyPulseService } from "./daily-pulse.service";
import type { PersonalizationSignals } from "../types/personalization.types";
import type {
  GuidedJourneyOption,
  GuidedJourneyPayload,
  GuidedJourneyStepPayload
} from "../types/guided-journey.types";

const selectOptionSchema = z.object({
  optionKey: z.string().min(1)
});

const advanceSchema = z.object({
  completeCurrentStep: z.boolean().optional()
});

export class GuidedJourneyService {
  private readonly repository = new GuidedJourneyRepository();
  private readonly personalizationService = new PersonalizationService();
  private readonly dailyPulseService = new DailyPulseService();

  async createOrResume(userId: string, obligationId: string) {
    const obligation = await this.repository.findObligationById(userId, obligationId);
    if (!obligation) {
      throw new AppError("NOT_FOUND", "Obligation not found", 404);
    }

    ensureObligationCanStartJourney(obligation.status);

    const existing = await this.repository.findActiveJourneyByObligation(userId, obligationId);
    if (existing) {
      await this.repository.runInTransaction(async (tx) => {
        await this.repository.createJourneyEvent(
          {
            journeyId: existing.id,
            userId,
            obligationId,
            eventType: GuidedJourneyEventType.JOURNEY_RESUMED
          },
          tx
        );

        await this.repository.createAuditEvent(
          {
            userId,
            obligationId,
            eventType: "guided_journey_resumed",
            metadata: {
              journeyId: existing.id
            }
          },
          tx
        );
      });

      const refreshed = await this.repository.findByIdForUser(userId, existing.id);
      if (!refreshed) {
        throw new AppError("NOT_FOUND", "Guided journey not found", 404);
      }

      return {
        journey: this.toJourneyPayload(refreshed),
        resumed: true
      };
    }

    const personalizationSummary = await this.personalizationService
      .getSummary(userId)
      .catch(() => null);
    const signals = personalizationSummary?.signals ?? getDefaultSignals();

    const baseTemplate = buildGuidedJourneyTemplate(mapObligation(obligation));
    const personalizedTemplate = this.personalizationService.personalizeGuidedTemplate(
      baseTemplate,
      signals,
      {
        urgencyScore: Number(obligation.urgencyScore),
        effortLevel: obligation.effortLevel
      }
    );
    const template = personalizedTemplate.template;
    template.steps = normalizeTemplateSteps(template.steps);

    const created = await this.repository.runInTransaction(async (tx) => {
      const journey = await this.repository.createJourneyFromTemplate(
        {
          userId,
          obligationId,
          template
        },
        tx
      );

      await this.repository.createJourneyEvent(
        {
          journeyId: journey.id,
          userId,
          obligationId,
          eventType: GuidedJourneyEventType.JOURNEY_CREATED,
          metadata: {
            stepCount: journey.steps.length,
            journeyType: journey.journeyType,
            personalizationAdjustments: personalizedTemplate.adjustments
          }
        },
        tx
      );

      await this.repository.createAuditEvent(
        {
          userId,
          obligationId,
          eventType: "guided_journey_created",
          metadata: {
            journeyId: journey.id,
            journeyType: journey.journeyType
          }
        },
        tx
      );

      return journey;
    });

    return {
      journey: this.toJourneyPayload(created),
      resumed: false
    };
  }

  async getById(userId: string, journeyId: string) {
    const journey = await this.repository.findByIdForUser(userId, journeyId);
    if (!journey) {
      throw new AppError("NOT_FOUND", "Guided journey not found", 404);
    }

    return {
      journey: this.toJourneyPayload(journey)
    };
  }

  async getActiveByObligation(userId: string, obligationId: string) {
    const obligation = await this.repository.findObligationById(userId, obligationId);
    if (!obligation) {
      throw new AppError("NOT_FOUND", "Obligation not found", 404);
    }

    const journey = await this.repository.findActiveJourneyByObligation(userId, obligationId);

    return {
      journey: journey ? this.toJourneyPayload(journey) : null
    };
  }

  async selectOption(userId: string, journeyId: string, payload: unknown) {
    const input = selectOptionSchema.parse(payload);
    const journey = await this.requireJourney(userId, journeyId);
    this.ensureJourneyEditable(journey.status, journey.obligation.status);

    const currentStep = getCurrentStep(journey);
    if (currentStep.inputType !== GuidedJourneyInputType.SINGLE_SELECT) {
      throw new AppError("INVALID_STATE", "Current step does not accept options", 409);
    }

    const options = parseStepOptions(currentStep.optionsJson);
    const matched = options.find((option) => option.key === input.optionKey);
    if (!matched) {
      throw new AppError("VALIDATION_ERROR", "Invalid option for this step", 400);
    }

    await this.repository.runInTransaction(async (tx) => {
      await this.repository.setStepSelectedOption(currentStep.id, input.optionKey, tx);

      await this.repository.createJourneyEvent(
        {
          journeyId: journey.id,
          userId,
          obligationId: journey.obligationId,
          eventType: GuidedJourneyEventType.STEP_SELECTED_OPTION,
          metadata: {
            stepKey: currentStep.stepKey,
            optionKey: input.optionKey
          }
        },
        tx
      );

      await this.repository.createAuditEvent(
        {
          userId,
          obligationId: journey.obligationId,
          eventType: "guided_journey_option_selected",
          metadata: {
            journeyId: journey.id,
            stepKey: currentStep.stepKey,
            optionKey: input.optionKey
          }
        },
        tx
      );

      if (currentStep.recommendedOption) {
        await this.repository.createOutcomeFeedback(
          {
            userId,
            obligationId: journey.obligationId,
            guidedJourneyId: journey.id,
            sourceContext: OutcomeSourceContext.GUIDED_MODE,
            recommendationKey: currentStep.recommendedOption,
            selectedActionKey: input.optionKey,
            outcomeType:
              input.optionKey === currentStep.recommendedOption
                ? OutcomeType.FOLLOWED_RECOMMENDATION
                : OutcomeType.CHOSE_DIFFERENT_OPTION,
            note:
              input.optionKey === currentStep.recommendedOption
                ? "Selected the recommended guided option."
                : "Selected a different guided option than recommended.",
            metadata: {
              stepKey: currentStep.stepKey
            }
          },
          tx
        );
      }

    });

    if (journey.currentStepIndex >= journey.steps.length - 1) {
      await this.dailyPulseService
        .markCompletedFromGuidedJourney(userId, journey.obligationId)
        .catch(() => null);
    }

    const updated = await this.requireJourney(userId, journeyId);
    return {
      journey: this.toJourneyPayload(updated)
    };
  }

  async advance(userId: string, journeyId: string, payload: unknown) {
    const input = advanceSchema.parse(payload ?? {});
    const journey = await this.requireJourney(userId, journeyId);
    this.ensureJourneyEditable(journey.status, journey.obligation.status);

    const currentStep = getCurrentStep(journey);
    const completeCurrentStep = input.completeCurrentStep ?? true;

    if (!completeCurrentStep && !currentStep.isCompleted) {
      throw new AppError(
        "INVALID_STATE",
        "Current step must be completed before advancing.",
        409
      );
    }

    await this.repository.runInTransaction(async (tx) => {
      if (completeCurrentStep) {
        await this.completeStepIfNeeded({
          journey,
          currentStep,
          userId,
          tx
        });
      }

      const lastStepIndex = journey.steps.length - 1;
      if (journey.currentStepIndex >= lastStepIndex) {
        await this.repository.markAllStepsCompleted(journey.id, tx);
        await this.repository.updateJourneyStatus(
          journey.id,
          GuidedJourneyStatus.COMPLETED,
          tx
        );

        await this.repository.createJourneyEvent(
          {
            journeyId: journey.id,
            userId,
            obligationId: journey.obligationId,
            eventType: GuidedJourneyEventType.JOURNEY_COMPLETED
          },
          tx
        );

        await this.repository.createAuditEvent(
          {
            userId,
            obligationId: journey.obligationId,
            eventType: "guided_journey_completed",
            metadata: {
              journeyId: journey.id
            }
          },
          tx
        );

        await this.repository.createOutcomeFeedback(
          {
            userId,
            obligationId: journey.obligationId,
            guidedJourneyId: journey.id,
            sourceContext: OutcomeSourceContext.GUIDED_MODE,
            recommendationKey: journey.recommendedPath,
            selectedActionKey: "complete_journey",
            outcomeType: OutcomeType.COMPLETED_SUCCESSFULLY,
            note: "Guided journey completed from advance flow."
          },
          tx
        );

        return;
      }

      const nextStep = journey.steps[journey.currentStepIndex + 1];
      await this.repository.updateCurrentStep(
        journey.id,
        {
          currentStepIndex: journey.currentStepIndex + 1,
          currentStepKey: nextStep.stepKey
        },
        tx
      );

      await this.repository.createJourneyEvent(
        {
          journeyId: journey.id,
          userId,
          obligationId: journey.obligationId,
          eventType: GuidedJourneyEventType.STEP_ADVANCED,
          metadata: {
            fromStepKey: currentStep.stepKey,
            toStepKey: nextStep.stepKey
          }
        },
        tx
      );

      await this.repository.createAuditEvent(
        {
          userId,
          obligationId: journey.obligationId,
          eventType: "guided_journey_step_advanced",
          metadata: {
            journeyId: journey.id,
            fromStepKey: currentStep.stepKey,
            toStepKey: nextStep.stepKey
          }
        },
        tx
      );

    });

    await this.dailyPulseService
      .markCompletedFromGuidedJourney(userId, journey.obligationId)
      .catch(() => null);

    const updated = await this.requireJourney(userId, journeyId);
    return {
      journey: this.toJourneyPayload(updated)
    };
  }

  async back(userId: string, journeyId: string) {
    const journey = await this.requireJourney(userId, journeyId);
    this.ensureJourneyEditable(journey.status, journey.obligation.status);

    if (journey.currentStepIndex === 0) {
      return {
        journey: this.toJourneyPayload(journey)
      };
    }

    const previousStep = journey.steps[journey.currentStepIndex - 1];

    await this.repository.runInTransaction(async (tx) => {
      await this.repository.updateCurrentStep(
        journey.id,
        {
          currentStepIndex: journey.currentStepIndex - 1,
          currentStepKey: previousStep.stepKey
        },
        tx
      );

      await this.repository.createJourneyEvent(
        {
          journeyId: journey.id,
          userId,
          obligationId: journey.obligationId,
          eventType: GuidedJourneyEventType.STEP_REVERSED,
          metadata: {
            fromStepKey: journey.steps[journey.currentStepIndex].stepKey,
            toStepKey: previousStep.stepKey
          }
        },
        tx
      );

      await this.repository.createAuditEvent(
        {
          userId,
          obligationId: journey.obligationId,
          eventType: "guided_journey_step_reversed",
          metadata: {
            journeyId: journey.id,
            fromStepKey: journey.steps[journey.currentStepIndex].stepKey,
            toStepKey: previousStep.stepKey
          }
        },
        tx
      );

    });

    const updated = await this.requireJourney(userId, journeyId);
    return {
      journey: this.toJourneyPayload(updated)
    };
  }

  async complete(userId: string, journeyId: string) {
    const journey = await this.requireJourney(userId, journeyId);
    if (journey.status === GuidedJourneyStatus.COMPLETED) {
      return {
        journey: this.toJourneyPayload(journey)
      };
    }

    this.ensureJourneyEditable(journey.status, journey.obligation.status);

    await this.repository.runInTransaction(async (tx) => {
      await this.repository.markAllStepsCompleted(journey.id, tx);

      const lastStepIndex = journey.steps.length - 1;
      const lastStepKey = journey.steps[lastStepIndex]?.stepKey ?? null;

      await this.repository.updateCurrentStep(
        journey.id,
        {
          currentStepIndex: Math.max(0, lastStepIndex),
          currentStepKey: lastStepKey
        },
        tx
      );

      await this.repository.updateJourneyStatus(
        journey.id,
        GuidedJourneyStatus.COMPLETED,
        tx
      );

      await this.repository.createJourneyEvent(
        {
          journeyId: journey.id,
          userId,
          obligationId: journey.obligationId,
          eventType: GuidedJourneyEventType.JOURNEY_COMPLETED
        },
        tx
      );

      await this.repository.createAuditEvent(
        {
          userId,
          obligationId: journey.obligationId,
          eventType: "guided_journey_completed",
          metadata: {
            journeyId: journey.id,
            via: "explicit_complete"
          }
        },
        tx
      );

      await this.repository.createOutcomeFeedback(
        {
          userId,
          obligationId: journey.obligationId,
          guidedJourneyId: journey.id,
          sourceContext: OutcomeSourceContext.GUIDED_MODE,
          recommendationKey: journey.recommendedPath,
          selectedActionKey: "complete_journey",
          outcomeType: OutcomeType.COMPLETED_SUCCESSFULLY,
          note: "Guided journey completed explicitly."
        },
        tx
      );

    });

    const updated = await this.requireJourney(userId, journeyId);
    return {
      journey: this.toJourneyPayload(updated)
    };
  }

  async abandon(userId: string, journeyId: string) {
    return this.transitionToEndedState(
      userId,
      journeyId,
      GuidedJourneyStatus.ABANDONED,
      GuidedJourneyEventType.JOURNEY_ABANDONED,
      "guided_journey_abandoned"
    );
  }

  async dismiss(userId: string, journeyId: string) {
    return this.transitionToEndedState(
      userId,
      journeyId,
      GuidedJourneyStatus.DISMISSED,
      GuidedJourneyEventType.JOURNEY_DISMISSED,
      "guided_journey_dismissed"
    );
  }

  private async transitionToEndedState(
    userId: string,
    journeyId: string,
    targetStatus: "ABANDONED" | "DISMISSED",
    eventType: "JOURNEY_ABANDONED" | "JOURNEY_DISMISSED",
    auditEventType: string
  ) {
    const journey = await this.requireJourney(userId, journeyId);
    if (journey.status === GuidedJourneyStatus.COMPLETED) {
      throw new AppError(
        "INVALID_STATE",
        "Completed journeys are read-only and cannot be changed.",
        409
      );
    }

    if (journey.status === targetStatus) {
      return {
        journey: this.toJourneyPayload(journey)
      };
    }

    await this.repository.runInTransaction(async (tx) => {
      await this.repository.updateJourneyStatus(journey.id, targetStatus, tx);

      await this.repository.createJourneyEvent(
        {
          journeyId: journey.id,
          userId,
          obligationId: journey.obligationId,
          eventType
        },
        tx
      );

      await this.repository.createAuditEvent(
        {
          userId,
          obligationId: journey.obligationId,
          eventType: auditEventType,
          metadata: {
            journeyId: journey.id
          }
        },
        tx
      );

      await this.repository.createOutcomeFeedback(
        {
          userId,
          obligationId: journey.obligationId,
          guidedJourneyId: journey.id,
          sourceContext: OutcomeSourceContext.GUIDED_MODE,
          recommendationKey: journey.recommendedPath,
          selectedActionKey:
            targetStatus === GuidedJourneyStatus.ABANDONED
              ? "abandon_journey"
              : "dismiss_journey",
          outcomeType:
            targetStatus === GuidedJourneyStatus.ABANDONED
              ? OutcomeType.ABANDONED
              : OutcomeType.DISMISSED_NOT_RELEVANT,
          note:
            targetStatus === GuidedJourneyStatus.ABANDONED
              ? "Guided journey was abandoned."
              : "Guided journey was dismissed."
        },
        tx
      );
    });

    const updated = await this.requireJourney(userId, journeyId);
    return {
      journey: this.toJourneyPayload(updated)
    };
  }

  private async completeStepIfNeeded(input: {
    journey: Awaited<ReturnType<GuidedJourneyService["requireJourney"]>>;
    currentStep: Awaited<ReturnType<typeof getCurrentStep>>;
    userId: string;
    tx: Prisma.TransactionClient;
  }) {
    const { journey, currentStep, userId, tx } = input;
    if (currentStep.isCompleted) return;

    if (
      currentStep.inputType === GuidedJourneyInputType.SINGLE_SELECT &&
      !currentStep.selectedOption
    ) {
      if (currentStep.recommendedOption) {
        await this.repository.setStepSelectedOption(
          currentStep.id,
          currentStep.recommendedOption,
          tx
        );
      } else {
        throw new AppError(
          "INVALID_STATE",
          "Select an option before advancing this step.",
          409
        );
      }
    }

    await this.repository.markStepCompleted(currentStep.id, tx);

    await this.repository.createJourneyEvent(
      {
        journeyId: journey.id,
        userId,
        obligationId: journey.obligationId,
        eventType: GuidedJourneyEventType.STEP_COMPLETED,
        metadata: {
          stepKey: currentStep.stepKey
        }
      },
      tx
    );

    await this.repository.createAuditEvent(
      {
        userId,
        obligationId: journey.obligationId,
        eventType: "guided_journey_step_completed",
        metadata: {
          journeyId: journey.id,
          stepKey: currentStep.stepKey
        }
      },
      tx
    );
  }

  private async requireJourney(userId: string, journeyId: string) {
    const journey = await this.repository.findByIdForUser(userId, journeyId);
    if (!journey) {
      throw new AppError("NOT_FOUND", "Guided journey not found", 404);
    }
    return journey;
  }

  private ensureJourneyEditable(
    status: GuidedJourneyStatus,
    obligationStatus: ObligationStatus
  ) {
    if (status !== GuidedJourneyStatus.ACTIVE) {
      throw new AppError("INVALID_STATE", "Journey is no longer active.", 409);
    }

    if (
      obligationStatus === ObligationStatus.RESOLVED ||
      obligationStatus === ObligationStatus.IGNORED
    ) {
      throw new AppError(
        "INVALID_STATE",
        "This obligation is already closed. Complete or abandon the journey instead.",
        409
      );
    }
  }

  private toJourneyPayload(journey: GuidedJourneyWithRelations): GuidedJourneyPayload {
    const steps = journey.steps.map((step) => this.toStepPayload(step));
    const totalSteps = steps.length;

    const safeStepIndex =
      journey.currentStepIndex >= 0 && journey.currentStepIndex < steps.length
        ? journey.currentStepIndex
        : 0;

    const currentStep = steps[safeStepIndex] ?? null;
    const completedCount = steps.filter((step) => step.isCompleted).length;

    const progressPercent =
      journey.status === GuidedJourneyStatus.COMPLETED
        ? 100
        : totalSteps === 0
          ? 0
          : Math.round((completedCount / totalSteps) * 100);

    return {
      id: journey.id,
      obligationId: journey.obligationId,
      journeyType: journey.journeyType,
      status: journey.status,
      currentStepKey: journey.currentStepKey,
      currentStepIndex: safeStepIndex,
      totalSteps,
      progressPercent,
      summary: journey.summary,
      recommendedPath: journey.recommendedPath,
      currentStep,
      steps,
      createdAt: journey.createdAt.toISOString(),
      updatedAt: journey.updatedAt.toISOString(),
      completedAt: journey.completedAt?.toISOString() ?? null
    };
  }

  private toStepPayload(step: {
    stepKey: string;
    title: string;
    description: string;
    whyItMatters: string;
    inputType: GuidedJourneyInputType;
    optionsJson: Prisma.JsonValue | null;
    recommendedOption: string | null;
    selectedOption: string | null;
    isCompleted: boolean;
    completedAt: Date | null;
    position: number;
  }): GuidedJourneyStepPayload {
    return {
      key: step.stepKey,
      title: step.title,
      description: step.description,
      whyItMatters: step.whyItMatters,
      inputType: step.inputType,
      options: parseStepOptions(step.optionsJson),
      recommendedOption: step.recommendedOption,
      selectedOption: step.selectedOption,
      isCompleted: step.isCompleted,
      completedAt: step.completedAt?.toISOString() ?? null,
      position: step.position
    };
  }
}

function ensureObligationCanStartJourney(status: ObligationStatus) {
  if (status === ObligationStatus.RESOLVED || status === ObligationStatus.IGNORED) {
    throw new AppError(
      "INVALID_STATE",
      "This obligation is already closed and cannot start a guided journey.",
      409
    );
  }
}

function getCurrentStep(journey: {
  currentStepIndex: number;
  steps: Array<{
    id: string;
    stepKey: string;
    inputType: GuidedJourneyInputType;
    optionsJson: Prisma.JsonValue | null;
    selectedOption: string | null;
    recommendedOption: string | null;
    isCompleted: boolean;
  }>;
}) {
  const step = journey.steps[journey.currentStepIndex];
  if (!step) {
    throw new AppError("INVALID_STATE", "Journey has no current step", 409);
  }
  return step;
}

function parseStepOptions(value: Prisma.JsonValue | null): GuidedJourneyOption[] {
  if (!Array.isArray(value)) return [];

  const options: GuidedJourneyOption[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    const key = typeof item.key === "string" ? item.key : null;
    const label = typeof item.label === "string" ? item.label : null;
    const description =
      typeof item.description === "string" ? item.description : undefined;

    if (!key || !label) continue;
    options.push({ key, label, description });
  }

  return options;
}

function getDefaultSignals(): PersonalizationSignals {
  return {
    subscriptionPreferenceBias: "balanced",
    postponementPattern: "none",
    quickWinAffinity: "medium",
    urgencyResponsiveness: "medium",
    moneySensitivity: "review_first",
    journeyCompletionStyle: "mixed",
    reminderReliance: "low"
  };
}
