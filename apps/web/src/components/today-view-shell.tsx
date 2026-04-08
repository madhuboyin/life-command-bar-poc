"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyTodayItemAction,
  createOrResumeGuidedJourney
} from "../lib/api";
import { buildGuidedHref } from "../lib/flow-navigation";
import type { DailyCommandCenterResponse, TodayActionKey } from "../lib/types";
import { buttonStyles, cardStyles, colors, pageStyles } from "../lib/ui";
import { useFlowSession } from "./flow-session-provider";
import TodayCompletedCollapsed from "./today-completed-collapsed";
import TodayEmptyState from "./today-empty-state";
import TodayPrimaryItemCard from "./today-primary-item-card";
import TodaySummaryStrip from "./today-summary-strip";
import TodayUpcomingList from "./today-upcoming-list";
import { useToast } from "./ui/toast-provider";

export default function TodayViewShell({
  initialData,
  initialError = null
}: {
  initialData: DailyCommandCenterResponse | null;
  initialError?: string | null;
}) {
  const [data, setData] = useState<DailyCommandCenterResponse | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [loadingAction, setLoadingAction] = useState<Record<string, TodayActionKey | null>>({});
  const flow = useFlowSession();
  const router = useRouter();
  const { showToast } = useToast();

  const primaryIds = useMemo(
    () => (data?.primaryItems ?? []).map((item) => item.id),
    [data?.primaryItems]
  );

  async function handleAction(itemId: string, actionKey: TodayActionKey) {
    try {
      setError(null);
      setLoadingAction((current) => ({
        ...current,
        [itemId]: actionKey
      }));

      const result = await applyTodayItemAction(itemId, {
        actionKey
      });

      if (result.status === "OPENED_GUIDED") {
        const journey = await createOrResumeGuidedJourney(itemId);
        const session = await flow.startSession({
          sourceType: "TODAY_FEED",
          sourceContext: {
            label: "Today View",
            returnPath: "/today",
            obligationIds: primaryIds
          },
          currentObligationId: itemId,
          currentJourneyId: journey.journey.id
        });

        showToast({
          variant: "info",
          title: "Opening guided flow",
          description: "You can come right back to Today when finished."
        });

        router.push(buildGuidedHref(journey.journey.id, session.id));
        return;
      }

      if (result.targetHref && result.status === "ROUTED") {
        router.push(result.targetHref);
        return;
      }

      setData(result.today);
      showToast({
        variant: "success",
        title: result.message,
        description:
          result.today.primaryItems.length === 0
            ? "You are done for now."
            : `${result.today.primaryItems.length} left in today.`
      });
    } catch (actionError) {
      const message =
        actionError instanceof Error ? actionError.message : "Could not apply action";
      setError(message);
      showToast({ variant: "error", title: "Action failed", description: message });
    } finally {
      setLoadingAction((current) => ({
        ...current,
        [itemId]: null
      }));
    }
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to dashboard
        </Link>
      </div>

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 6px 0", fontSize: 34 }}>Today</h1>
          <p style={{ margin: 0, color: colors.textMuted }}>
            The clearest answer to what to do next.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/pulse" style={buttonStyles.link}>
            Open Pulse
          </Link>
          <Link href="/control-tower" style={buttonStyles.link}>
            Control Tower
          </Link>
        </div>
      </header>

      {error ? (
        <section style={{ ...cardStyles.bordered, color: colors.errorText, marginBottom: 12 }}>
          {error}
        </section>
      ) : null}

      {data ? (
        <div style={{ display: "grid", gap: 12 }}>
          <TodaySummaryStrip summary={data.summary} pulse={data.pulse} />

          {data.primaryItems.length === 0 ? (
            <TodayEmptyState />
          ) : (
            <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: colors.textMuted }}>Needs Attention Today</div>
              {data.primaryItems.map((item) => (
                <TodayPrimaryItemCard
                  key={item.id}
                  item={item}
                  loading={loadingAction[item.id] ?? null}
                  onAction={handleAction}
                />
              ))}
            </section>
          )}

          <TodayUpcomingList items={data.upcoming} />
          <TodayCompletedCollapsed items={data.completedOrSafe} />

          {data.summary.reviewCount > 0 ? (
            <section style={{ ...cardStyles.bordered }}>
              <div style={{ marginBottom: 6, fontWeight: 700 }}>Need more context?</div>
              <div style={{ color: colors.textMuted, marginBottom: 10 }}>
                Some items still need review evidence before final action.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href="/review" style={buttonStyles.link}>
                  Open Review Queue
                </Link>
                <Link href="/control-tower" style={buttonStyles.link}>
                  Open Control Tower
                </Link>
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <TodayEmptyState />
      )}
    </main>
  );
}
