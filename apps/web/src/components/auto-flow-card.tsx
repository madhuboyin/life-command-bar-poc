"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptAutoFlow,
  createOrResumeFlowSession,
  createOrResumeGuidedJourney,
  dismissAutoFlow
} from "../lib/api";
import { buildGuidedHref } from "../lib/flow-navigation";
import type { AutoFlowItem } from "../lib/types";
import { buttonStyles, cardStyles } from "../lib/ui";
import AutoFlowBadge from "./auto-flow-badge";
import WhyThisExplanation from "./why-this-explanation";
import { useToast } from "./ui/toast-provider";
import SourceBadge from "./source-badge";
import ConfidenceBadge from "./confidence-badge";

type Props = {
  item: AutoFlowItem;
  onUpdated: () => Promise<void>;
  returnPath?: string;
};

export default function AutoFlowCard({ item, onUpdated, returnPath = "/pulse" }: Props) {
  const [loading, setLoading] = useState<"accept" | "dismiss" | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  async function handleAccept() {
    try {
      setLoading("accept");
      await acceptAutoFlow(item.id);
      const journey = await createOrResumeGuidedJourney(item.obligationId);
      const session = await createOrResumeFlowSession({
        sourceType: "AUTO_FLOW",
        sourceContext: {
          label: "Auto-Flow",
          returnPath,
          obligationIds: [item.obligationId]
        },
        currentObligationId: item.obligationId,
        currentJourneyId: journey.journey.id
      });

      showToast({
        variant: "success",
        title: "Auto-flow accepted",
        description: item.obligation.title
      });

      router.push(buildGuidedHref(journey.journey.id, session.session.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open auto-flow";
      showToast({ variant: "error", title: "Auto-flow failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleDismiss() {
    try {
      setLoading("dismiss");
      await dismissAutoFlow(item.id, "dismissed_from_surface");
      await onUpdated();
      showToast({ variant: "success", title: "Dismissed", description: item.obligation.title });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not dismiss auto-flow";
      showToast({ variant: "error", title: "Dismiss failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <article style={cardStyles.item}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{item.obligation.title}</h3>
        <AutoFlowBadge
          autoFlow={{
            id: item.id,
            triggerType: item.triggerType,
            state: item.state,
            priorityScore: item.priorityScore,
            ctaLabel: item.cta.label
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <SourceBadge sourceType={item.obligation.sourceType} />
        <ConfidenceBadge
          confidenceBand={item.obligation.confidenceBand}
          needsReview={item.obligation.needsReview}
        />
      </div>

      <WhyThisExplanation why={item.why} decisionTrace={item.decisionTrace} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={handleAccept} disabled={loading !== null} style={buttonStyles.primary}>
          {loading === "accept" ? "Preparing..." : item.cta.label}
        </button>
        <button onClick={handleDismiss} disabled={loading !== null} style={buttonStyles.secondary}>
          {loading === "dismiss" ? "Saving..." : "Dismiss"}
        </button>
      </div>
    </article>
  );
}
