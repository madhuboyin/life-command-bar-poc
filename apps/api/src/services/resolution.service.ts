import { ObligationType } from "@prisma/client";
import {
  buildBillFlow,
  buildRenewalFlow,
  buildSubscriptionFlow
} from "@lcb/flows";
import { prisma } from "../clients/prisma.client";
import { ObligationRepository } from "../repositories/obligation.repository";
import { mapObligation } from "../utils/obligation.mapper";

export class ResolutionService {
  private readonly obligationRepository = new ObligationRepository();

  async getResolution(userId: string, obligationId: string) {
    const obligation = await this.obligationRepository.findById(obligationId, userId);
    if (!obligation) return null;

    const mapped = mapObligation(obligation);
    const flow = this.buildFlow(obligation.type, mapped);

    await prisma.resolutionRun.create({
      data: {
        userId,
        obligationId: obligation.id,
        flowKey: flow.flowKey,
        recommendedOption: flow.recommendation,
        confidence: "HIGH"
      }
    });

    return {
      obligationId: obligation.id,
      recommendation: {
        flowKey: flow.flowKey,
        recommendation: flow.recommendation,
        whyItMatters: flow.whyItMatters,
        decisionOptions: [
          {
            key: "primary",
            label: flow.primaryAction
          },
          ...flow.secondaryActions.map((action) => ({
            key: action,
            label: action
          }))
        ],
        recommendedOption: "primary",
        steps: flow.steps,
        primaryAction: {
          key: flow.primaryAction,
          label: flow.primaryAction
        },
        secondaryActions: flow.secondaryActions.map((action) => ({
          key: action,
          label: action
        }))
      }
    };
  }

  private buildFlow(type: ObligationType, obligation: ReturnType<typeof mapObligation>) {
    switch (type) {
      case ObligationType.SUBSCRIPTION:
        return buildSubscriptionFlow(obligation as never);
      case ObligationType.RENEWAL:
        return buildRenewalFlow(obligation as never);
      case ObligationType.BILL:
      case ObligationType.COMMITMENT:
      default:
        return buildBillFlow(obligation as never);
    }
  }
}
