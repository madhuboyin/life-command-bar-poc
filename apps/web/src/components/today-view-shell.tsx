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
import TodayEmptyState from "./today-empty-state";
import TodayPrimaryItemCard from "./today-primary-item-card";
import { useToast } from "./ui/toast-provider";
import { shouldShowHeaderUpcomingAction } from "./today-view-shell.helpers";

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

  const loopItemIds = useMemo(() => {
    if (!data) return [];
    const ids: string[] = [];
    if (data.primaryItem) {
      ids.push(data.primaryItem.id);
    }
    for (const queued of data.queuedItems) {
      ids.push(queued.id);
    }
    return ids;
  }, [data]);

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
            obligationIds: loopItemIds
          },
          currentObligationId: itemId,
          currentJourneyId: journey.journey.id
        });

        showToast({
          variant: "info",
          title: "Opening guided flow",
          description: "You can come right back to Today whenever you are ready."
        });

        router.push(buildGuidedHref(journey.journey.id, session.id));
        return;
      }

      if (result.targetHref && result.status === "ROUTED") {
        router.push(result.targetHref);
        return;
      }

      const nextRemaining = countRemainingItems(result.today);
      setData(result.today);
      showToast({
        variant: "success",
        title: result.message,
        description:
          nextRemaining === 0
            ? "You are all set for now. Add one thing and we'll remind you before it comes up."
            : result.today.primaryItem
              ? `Up next: ${result.today.primaryItem.title}`
              : `${nextRemaining} left for today.`
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
            Know what matters. Act quickly. Stay in control.
          </p>
        </div>
        {shouldShowHeaderUpcomingAction(data) ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/upcoming" style={buttonStyles.link}>
              View upcoming
            </Link>
          </div>
        ) : null}
      </header>

      {error ? (
        <section style={{ ...cardStyles.bordered, color: colors.errorText, marginBottom: 12 }}>
          {error}
        </section>
      ) : null}

      {data ? (
        <div style={{ display: "grid", gap: 12 }}>
          <section style={{ ...cardStyles.section, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: colors.textMuted }}>Today status</div>
            <h2 style={{ margin: 0, fontSize: 30 }}>{data.headline}</h2>
            <p style={{ margin: 0, color: colors.textMuted }}>{data.subheadline}</p>
          </section>

          {data.todayState === "CLEAR" || !data.primaryItem ? (
            <TodayEmptyState
              headline={data.headline}
              subheadline={data.subheadline}
              nextUp={data.nextUp}
              viewUpcomingAvailable={data.viewUpcomingAvailable}
              mode="follow_up"
            />
          ) : (
            <>
              <TodayPrimaryItemCard
                item={data.primaryItem}
                loading={loadingAction[data.primaryItem.id] ?? null}
                onAction={handleAction}
              />

              {data.queuedItems.length > 0 ? (
                <section style={{ ...cardStyles.bordered, display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>After this</div>
                  <div style={{ fontWeight: 700 }}>{data.queuedItems[0]?.title}</div>
                  <div style={{ color: colors.textMuted, fontSize: 13 }}>
                    {data.queuedItems.length === 1
                      ? "One more item after this."
                      : `${data.queuedItems.length} more items queued after this.`}
                  </div>
                </section>
              ) : null}

              {data.todayState === "REVIEW_NEEDED" ? (
                <section style={{ ...cardStyles.bordered, color: colors.textMuted }}>
                  You can review this now and decide with confidence.
                </section>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <TodayEmptyState />
      )}
    </main>
  );
}

function countRemainingItems(today: DailyCommandCenterResponse) {
  return (today.primaryItem ? 1 : 0) + today.queuedItems.length;
}
