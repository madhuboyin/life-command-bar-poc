"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  completeDailyPulseItem,
  createFeedback,
  createOrResumeGuidedJourney,
  createOutcomeFeedback,
  dismissDailyPulseItem,
  dismissObligation,
  markObligationDone,
  openGuidedDailyPulseItem,
  postponeDailyPulseItem,
  postponeObligation,
} from "../lib/api";
import type { DailyPulseItem, DailyPulseItemUpdateResponse } from "../lib/types";
import { buildGuidedHref } from "../lib/flow-navigation";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import { useFlowSession } from "./flow-session-provider";
import { useToast } from "./ui/toast-provider";
import SourceBadge from "./source-badge";
import ConfidenceBadge from "./confidence-badge";
import WhyThisExplanation from "./why-this-explanation";

type Props = {
  item: DailyPulseItem;
  flowObligationIds: string[];
  onItemUpdated: (payload: DailyPulseItemUpdateResponse) => void;
};

export default function PulseItemCard({ item, flowObligationIds, onItemUpdated }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();
  const { showToast } = useToast();
  const flow = useFlowSession();
  const guideLabel = item.status === "OPENED_GUIDED" ? "Resume guided" : item.actionLabel;

  async function reportOutcome(input: {
    selectedActionKey: string;
    outcomeType: "COMPLETED_SUCCESSFULLY" | "POSTPONED_INTENTIONALLY" | "DISMISSED_NOT_RELEVANT";
    note?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await createOutcomeFeedback({
        obligationId: item.obligationId,
        sourceContext: "DAILY_PULSE",
        recommendationKey: item.actionLabel,
        selectedActionKey: input.selectedActionKey,
        outcomeType: input.outcomeType,
        note: input.note,
        metadata: input.metadata
      });
    } catch {
      // Non-blocking feedback signal capture.
    }
  }

  async function handleGuideMe() {
    try {
      setLoading("guide");
      const pulseUpdate = await openGuidedDailyPulseItem(item.obligationId).catch(() => null);
      if (pulseUpdate) {
        onItemUpdated(pulseUpdate);
      }

      const data = await createOrResumeGuidedJourney(item.obligationId);
      const session = await flow.startSession({
        sourceType: "DAILY_PULSE",
        sourceContext: {
          label: "Today's Pulse",
          returnPath: "/pulse",
          obligationIds: flowObligationIds
        },
        currentObligationId: item.obligationId,
        currentJourneyId: data.journey.id
      });

      router.push(buildGuidedHref(data.journey.id, session.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start Guided Mode";
      showToast({ variant: "error", title: "Guided Mode failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleDone() {
    try {
      setLoading("done");
      await markObligationDone(item.obligationId, "Completed from Daily Pulse");
      await createFeedback({
        obligationId: item.obligationId,
        type: "COMPLETED",
        note: "Completed from Daily Pulse"
      });
      const pulseUpdate = await completeDailyPulseItem(item.obligationId);
      await reportOutcome({
        selectedActionKey: "mark_done",
        outcomeType: "COMPLETED_SUCCESSFULLY",
        note: "Completed from Daily Pulse"
      });

      onItemUpdated(pulseUpdate);
      showToast({
        variant: "success",
        title: "+1 cleared from today's pulse",
        description: pulseUpdate.momentum.completionMessage
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not mark done";
      showToast({ variant: "error", title: "Action failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleDismiss() {
    try {
      setLoading("dismiss");
      await dismissObligation(item.obligationId, "dismissed_from_daily_pulse");
      await createFeedback({
        obligationId: item.obligationId,
        type: "DONT_SHOW_AGAIN",
        note: "Dismissed from Daily Pulse"
      });
      const pulseUpdate = await dismissDailyPulseItem(item.obligationId);
      await reportOutcome({
        selectedActionKey: "dismiss",
        outcomeType: "DISMISSED_NOT_RELEVANT",
        note: "Dismissed from Daily Pulse"
      });

      onItemUpdated(pulseUpdate);
      showToast({
        variant: "success",
        title: "Pulse updated",
        description: pulseUpdate.momentum.completionMessage
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not dismiss";
      showToast({ variant: "error", title: "Action failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handlePostpone() {
    try {
      setLoading("postpone");
      const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await postponeObligation(
        item.obligationId,
        until,
        "Postponed 1 day from Daily Pulse"
      );
      await createFeedback({
        obligationId: item.obligationId,
        type: "POSTPONED",
        note: "Postponed from Daily Pulse"
      });
      const pulseUpdate = await postponeDailyPulseItem(item.obligationId);
      await reportOutcome({
        selectedActionKey: "postpone_1_day",
        outcomeType: "POSTPONED_INTENTIONALLY",
        note: "Postponed from Daily Pulse",
        metadata: {
          postponedUntil: until
        }
      });

      onItemUpdated(pulseUpdate);
      showToast({
        variant: "success",
        title: "Postponed intentionally",
        description: pulseUpdate.momentum.completionMessage
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not postpone";
      showToast({ variant: "error", title: "Action failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <article style={cardStyles.item}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: colors.textMuted, display: "inline-flex", alignItems: "center" }}>
          {formatHookLabel(item.hookType)}
        </div>
        <SourceBadge sourceType={item.sourceType} />
        <ConfidenceBadge
          confidenceBand={item.confidenceBand}
          needsReview={item.needsReview}
        />
      </div>
      {item.status === "OPENED_GUIDED" ? (
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
          Guided Mode started
        </div>
      ) : null}
      <h3 style={{ margin: "0 0 6px 0" }}>{item.title}</h3>
      <div style={{ marginBottom: 12 }}>
        <WhyThisExplanation why={item.why} decisionTrace={item.decisionTrace} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, max-content))",
          gap: 10
        }}
      >
        <button onClick={handleGuideMe} disabled={loading !== null} style={buttonStyles.primary}>
          {loading === "guide" ? "Starting..." : guideLabel}
        </button>

        <button onClick={handleDone} disabled={loading !== null} style={buttonStyles.secondary}>
          {loading === "done" ? "Saving..." : "Handle now"}
        </button>

        <button onClick={handlePostpone} disabled={loading !== null} style={buttonStyles.secondary}>
          {loading === "postpone" ? "Saving..." : "Postpone"}
        </button>

        <button onClick={handleDismiss} disabled={loading !== null} style={buttonStyles.danger}>
          {loading === "dismiss" ? "Saving..." : "Dismiss"}
        </button>

        <Link href={`/obligations/${item.obligationId}`} style={buttonStyles.link}>
          View obligation
        </Link>
      </div>
    </article>
  );
}

function formatHookLabel(hookType: DailyPulseItem["hookType"]) {
  switch (hookType) {
    case "urgent":
      return "Urgent";
    case "quick_win":
      return "Quick win";
    case "money":
      return "Money";
    case "postponed":
      return "Postponed";
    default:
      return "Priority";
  }
}
