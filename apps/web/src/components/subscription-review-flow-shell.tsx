"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applySubscriptionReviewCancel,
  applySubscriptionReviewKeep,
  applySubscriptionReviewRemind,
  createOrResumeFlowSession,
  markSubscriptionReviewed
} from "../lib/api";
import { buildGuidedHref } from "../lib/flow-navigation";
import type { SubscriptionDecisionFlowData, SubscriptionReviewActionResponse } from "../lib/types";
import { cardStyles, colors, pageStyles } from "../lib/ui";
import {
  buildActionAftercareMessage,
  buildCompletionReliefMessage
} from "../lib/emotional-trust.service";
import ActionAftercareInline from "./action-aftercare-inline";
import { useFlowSession } from "./flow-session-provider";
import SubscriptionDecisionActions from "./subscription-decision-actions";
import SubscriptionDecisionHeader from "./subscription-decision-header";
import SubscriptionEvidenceSummary from "./subscription-evidence-summary";
import SubscriptionLifecycleTimeline from "./subscription-lifecycle-timeline";
import SubscriptionPriceHistory from "./subscription-price-history";
import SubscriptionRecommendationPanel from "./subscription-recommendation-panel";
import { useToast } from "./ui/toast-provider";

export default function SubscriptionReviewFlowShell({
  subscriptionId,
  initialData,
  initialError = null
}: {
  subscriptionId: string;
  initialData: SubscriptionDecisionFlowData | null;
  initialError?: string | null;
}) {
  const router = useRouter();
  const flow = useFlowSession();
  const { showToast } = useToast();
  const data = initialData;
  const [error, setError] = useState<string | null>(initialError);
  const [loadingAction, setLoadingAction] = useState<"KEEP" | "CANCEL" | "REMIND_LATER" | "DETAILS" | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [remindAt, setRemindAt] = useState("");
  const [lastAction, setLastAction] = useState<"KEEP" | "CANCEL" | "REMIND_LATER" | "CONFIRM" | "IGNORE" | null>(null);
  const openedAtRef = useRef<number>(Date.now());
  const detailsTrackedRef = useRef(false);

  const linkedObligations = useMemo(() => data?.detailSections.linkedObligations ?? [], [data]);

  async function finalize(
    response: SubscriptionReviewActionResponse,
    actionType: "KEEP" | "CANCEL" | "REMIND_LATER"
  ) {
    const aftercare = buildActionAftercareMessage({ actionType, trackAction: true });
    setLastAction(actionType);
    const nextId = response.nextReviewSubscriptionId;

    if (nextId) {
      showToast({
        variant: "success",
        title: aftercare.primary,
        description: aftercare.supporting ?? "Moving to the next subscription review item."
      });
      router.push(`/subscriptions/review/${nextId}`);
      return;
    }

    const completion = buildCompletionReliefMessage({
      remainingCount: 0,
      trackCompletion: true
    });
    showToast({
      variant: "success",
      title: completion.primary,
      description: completion.supporting ?? aftercare.supporting
    });
    router.push("/subscriptions/review");
  }

  async function handleKeep() {
    try {
      setLoadingAction("KEEP");
      setError(null);
      const response = await applySubscriptionReviewKeep(subscriptionId, {
        decisionDurationMs: Date.now() - openedAtRef.current
      });
      await finalize(response, "KEEP");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not keep subscription");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleCancel() {
    try {
      setLoadingAction("CANCEL");
      setError(null);
      const response = await applySubscriptionReviewCancel(subscriptionId, {
        handoffToGuided: true,
        decisionDurationMs: Date.now() - openedAtRef.current
      });

      if (response.guidedHandoff) {
        const session = await createOrResumeFlowSession({
          sourceType: "DASHBOARD",
          sourceContext: {
            label: "Subscription Review",
            returnPath: "/subscriptions/review",
            obligationIds: [response.guidedHandoff.obligationId]
          },
          currentObligationId: response.guidedHandoff.obligationId,
          currentJourneyId: response.guidedHandoff.journeyId
        });
        flow.setActiveSession(session.session);
        showToast({
          variant: "info",
          title: "Opening cancellation guidance",
          description: "Guided Mode will help you complete the cancellation path."
        });
        router.push(buildGuidedHref(response.guidedHandoff.journeyId, session.session.id));
        return;
      }

      await finalize(response, "CANCEL");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not mark cancellation");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleRemind() {
    try {
      setLoadingAction("REMIND_LATER");
      setError(null);
      const response = await applySubscriptionReviewRemind(subscriptionId, {
        remindAt: remindAt ? toIsoOrNull(remindAt) : undefined,
        decisionDurationMs: Date.now() - openedAtRef.current
      });
      await finalize(response, "REMIND_LATER");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not schedule reminder");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleToggleDetails() {
    try {
      setLoadingAction("DETAILS");
      setError(null);

      if (!detailsOpen && !detailsTrackedRef.current) {
        detailsTrackedRef.current = true;
        await markSubscriptionReviewed(subscriptionId, {
          context: "DETAILS_OPENED"
        });
      }

      setDetailsOpen((current) => !current);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not open details");
    } finally {
      setLoadingAction(null);
    }
  }

  if (!data) {
    return (
      <main style={pageStyles.shell}>
        <div style={{ marginBottom: 14 }}>
          <Link href="/subscriptions/review" style={{ color: "#2563eb", textDecoration: "none" }}>
            ← Back to review hub
          </Link>
        </div>
        <section style={{ ...cardStyles.section, color: colors.textMuted }}>
          {error ?? "Could not load review flow."}
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/subscriptions/review" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to review hub
        </Link>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <section style={{ ...cardStyles.section }}>
          <SubscriptionDecisionHeader subscription={data.subscription} />
        </section>

        <SubscriptionRecommendationPanel
          recommendation={data.recommendation}
          decisionContext={data.decisionContext}
        />

        <section style={{ ...cardStyles.section }}>
          <SubscriptionDecisionActions
            loadingAction={loadingAction}
            remindAt={remindAt}
            setRemindAt={setRemindAt}
            detailsOpen={detailsOpen}
            onKeep={() => void handleKeep()}
            onCancel={() => void handleCancel()}
            onRemind={() => void handleRemind()}
            onToggleDetails={() => void handleToggleDetails()}
          />
        </section>

        {lastAction ? (
          <section style={{ ...cardStyles.bordered }}>
            <ActionAftercareInline actionType={lastAction} />
          </section>
        ) : null}
        {error ? (
          <section style={{ ...cardStyles.bordered, color: colors.errorText }}>{error}</section>
        ) : null}

        {detailsOpen ? (
          <div style={{ display: "grid", gap: 12 }}>
            <SubscriptionPriceHistory items={data.detailSections.priceHistory} />
            <SubscriptionEvidenceSummary items={data.detailSections.evidenceSummary} />
            <SubscriptionLifecycleTimeline items={data.detailSections.lifecycleTimeline} />

            <section style={{ ...cardStyles.section, display: "grid", gap: 8 }}>
              <h3 style={{ margin: 0 }}>Linked obligations</h3>
              {linkedObligations.length === 0 ? (
                <div style={{ color: colors.textMuted, fontSize: 13 }}>No linked obligations yet.</div>
              ) : (
                linkedObligations.map((item) => (
                  <article key={item.id} style={{ ...cardStyles.item, display: "grid", gap: 4 }}>
                    <Link href={`/obligations/${item.id}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                      {item.title}
                    </Link>
                    <div style={{ color: colors.textMuted, fontSize: 13 }}>
                      {item.type} · {item.status}
                      {item.dueDate ? ` · Due ${item.dueDate.slice(0, 10)}` : ""}
                    </div>
                  </article>
                ))
              )}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function toIsoOrNull(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
