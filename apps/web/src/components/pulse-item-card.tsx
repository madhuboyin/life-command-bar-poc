"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createFeedback,
  createOrResumeGuidedJourney,
  createOutcomeFeedback,
  dismissObligation,
  markObligationDone,
  postponeObligation,
  trackDailyPulseAction
} from "../lib/api";
import type { DailyPulseItem } from "../lib/types";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import { useToast } from "./ui/toast-provider";

type Props = {
  item: DailyPulseItem;
  onResolved: (obligationId: string) => void;
};

export default function PulseItemCard({ item, onResolved }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();
  const { showToast } = useToast();

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
      const data = await createOrResumeGuidedJourney(item.obligationId);
      router.push(`/guided/${data.journey.id}`);
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
      await trackDailyPulseAction("COMPLETED");
      await reportOutcome({
        selectedActionKey: "mark_done",
        outcomeType: "COMPLETED_SUCCESSFULLY",
        note: "Completed from Daily Pulse"
      });

      onResolved(item.obligationId);
      showToast({
        variant: "success",
        title: "+1 cleared today",
        description: "Nice momentum."
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
      await trackDailyPulseAction("DISMISSED");
      await reportOutcome({
        selectedActionKey: "dismiss",
        outcomeType: "DISMISSED_NOT_RELEVANT",
        note: "Dismissed from Daily Pulse"
      });

      onResolved(item.obligationId);
      showToast({
        variant: "success",
        title: "Dismissed for today"
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
      await trackDailyPulseAction("POSTPONED");
      await reportOutcome({
        selectedActionKey: "postpone_1_day",
        outcomeType: "POSTPONED_INTENTIONALLY",
        note: "Postponed from Daily Pulse",
        metadata: {
          postponedUntil: until
        }
      });

      onResolved(item.obligationId);
      showToast({
        variant: "success",
        title: "Postponed intentionally"
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
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
        {formatHookLabel(item.hookType)}
      </div>
      <h3 style={{ margin: "0 0 6px 0" }}>{item.title}</h3>
      <p style={{ margin: "0 0 12px 0", color: colors.textMuted }}>{item.whyItMatters}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, max-content))",
          gap: 10
        }}
      >
        <button onClick={handleGuideMe} disabled={loading !== null} style={buttonStyles.primary}>
          {loading === "guide" ? "Starting..." : item.actionLabel}
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
