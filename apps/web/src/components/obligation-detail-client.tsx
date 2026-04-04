"use client";

import { useState } from "react";
import Link from "next/link";
import {
  createOrResumeGuidedJourney,
  createFeedback,
  createOutcomeFeedback,
  dismissObligation,
  getActiveGuidedJourneyForObligation,
  getObligationSource,
  getResolution,
  markObligationDone,
  postponeObligation
} from "../lib/api";
import type {
  GuidedJourney,
  Obligation,
  ObligationSourceDetails,
  ResolutionResponse
} from "../lib/types";
import { buildGuidedHref } from "../lib/flow-navigation";
import ResolutionModal from "./resolution-modal";
import {
  buttonStyles,
  cardStyles,
  colors,
  formatDateTime,
  pageStyles,
  text
} from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";
import ObligationDetailTabs from "./obligation-detail-tabs";
import EditObligationForm from "./edit-obligation-form";
import ObligationHistoryPanel from "./obligation-history-panel";
import ResumeGuidedJourneyCard from "./resume-guided-journey-card";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useFlowSession } from "./flow-session-provider";

type Props = {
  obligation: Obligation;
};

export default function ObligationDetailClient({ obligation }: Props) {
  const [current, setCurrent] = useState(obligation);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ResolutionResponse | null>(null);
  const [showResolution, setShowResolution] = useState(false);
  const [activeJourney, setActiveJourney] = useState<GuidedJourney | null>(null);
  const [sourceDetails, setSourceDetails] = useState<ObligationSourceDetails | null>(null);
  const isMobile = useIsMobile();
  const { showToast } = useToast();
  const router = useRouter();
  const flow = useFlowSession();

  async function reportOutcome(input: {
    selectedActionKey: string;
    outcomeType: "COMPLETED_SUCCESSFULLY" | "POSTPONED_INTENTIONALLY" | "DISMISSED_NOT_RELEVANT";
    note?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await createOutcomeFeedback({
        obligationId: current.id,
        sourceContext: "OBLIGATION_DETAIL",
        selectedActionKey: input.selectedActionKey,
        outcomeType: input.outcomeType,
        note: input.note,
        metadata: input.metadata
      });
    } catch {
      // Keep primary action flow resilient.
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadActiveJourney() {
      try {
        const [journeyData, sourceData] = await Promise.all([
          getActiveGuidedJourneyForObligation(current.id),
          getObligationSource(current.id).catch(() => null)
        ]);
        if (!cancelled) {
          setActiveJourney(journeyData.journey);
          setSourceDetails(sourceData);
        }
      } catch {
        if (!cancelled) {
          setActiveJourney(null);
          setSourceDetails(null);
        }
      }
    }

    loadActiveJourney();

    return () => {
      cancelled = true;
    };
  }, [current.id]);

  async function handleMarkDone() {
    try {
      setLoading("done");
      setError(null);
      const data = await markObligationDone(current.id, "Handled from detail page");
      await createFeedback({
        obligationId: current.id,
        type: "COMPLETED",
        note: "Marked done from detail page"
      });
      await reportOutcome({
        selectedActionKey: "mark_done",
        outcomeType: "COMPLETED_SUCCESSFULLY",
        note: "Completed from obligation detail"
      });
      setCurrent(data.obligation);
      showToast({ variant: "success", title: "Marked done", description: current.title });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to mark done";
      setError(message);
      showToast({ variant: "error", title: "Action failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleDismiss() {
    try {
      setLoading("dismiss");
      setError(null);
      const data = await dismissObligation(current.id, "dont_show_again");
      await createFeedback({
        obligationId: current.id,
        type: "DONT_SHOW_AGAIN",
        note: "Dismissed from detail page"
      });
      await reportOutcome({
        selectedActionKey: "dismiss",
        outcomeType: "DISMISSED_NOT_RELEVANT",
        note: "Dismissed from obligation detail"
      });
      setCurrent(data.obligation);
      showToast({ variant: "success", title: "Dismissed", description: current.title });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to dismiss";
      setError(message);
      showToast({ variant: "error", title: "Action failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handlePostpone() {
    try {
      setLoading("postpone");
      setError(null);
      const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const data = await postponeObligation(current.id, until, "Postponed 1 day from detail page");
      await createFeedback({
        obligationId: current.id,
        type: "POSTPONED",
        note: "Postponed 1 day from detail page"
      });
      await reportOutcome({
        selectedActionKey: "postpone_1_day",
        outcomeType: "POSTPONED_INTENTIONALLY",
        note: "Postponed from obligation detail",
        metadata: {
          postponedUntil: until
        }
      });
      setCurrent(data.obligation);
      showToast({ variant: "success", title: "Postponed", description: current.title });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to postpone";
      setError(message);
      showToast({ variant: "error", title: "Action failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleShowResolution() {
    try {
      setLoading("resolution");
      setError(null);
      const data = await getResolution(current.id);
      await createFeedback({
        obligationId: current.id,
        type: "ACCEPTED",
        note: "Opened resolution from detail page"
      });
      setResolution(data);
      setShowResolution(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load resolution";
      setError(message);
      showToast({ variant: "error", title: "Resolution failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleGuideMe() {
    try {
      setLoading("guide");
      setError(null);
      const data = await createOrResumeGuidedJourney(current.id);
      const session = await flow.startSession({
        sourceType: "OBLIGATION_DETAIL",
        sourceContext: {
          label: "Obligation detail",
          returnPath: `/obligations/${current.id}`,
          obligationIds: [current.id]
        },
        currentObligationId: current.id,
        currentJourneyId: data.journey.id
      });

      router.push(buildGuidedHref(data.journey.id, session.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start Guided Mode";
      setError(message);
      showToast({ variant: "error", title: "Guided Mode failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  const overview = (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={cardStyles.bordered}>
        <div style={text.label}>Overview</div>
        <div><strong>Vendor:</strong> {current.vendor ?? "—"}</div>
        <div><strong>Description:</strong> {current.description ?? "—"}</div>
        <div><strong>Due Date:</strong> {formatDateTime(current.dueDate)}</div>
        <div><strong>Amount:</strong> {current.amount ?? "—"} {current.currency ?? ""}</div>
        <div><strong>Source:</strong> {current.source}</div>
        {sourceDetails ? (
          <div>
            <strong>Provenance:</strong> {sourceDetails.provenanceLabel}
            {sourceDetails.parseConfidence !== null && sourceDetails.parseConfidence !== undefined
              ? ` (${Math.round(sourceDetails.parseConfidence * 100)}%)`
              : ""}
          </div>
        ) : null}
        <div><strong>Recurrence:</strong> {current.recurrence ?? "—"}</div>
      </section>

      <section style={cardStyles.bordered}>
        <div style={text.label}>Ranking Signals</div>
        <div><strong>Confidence:</strong> {current.confidenceScore}</div>
        <div><strong>Urgency:</strong> {current.urgencyScore}</div>
        <div><strong>Importance:</strong> {current.importanceScore}</div>
        <div><strong>Effort:</strong> {current.effortLevel}</div>
        <div><strong>Impact:</strong> {current.impactLevel}</div>
      </section>

      <section style={cardStyles.bordered}>
        <div style={text.label}>Timestamps</div>
        <div><strong>Created:</strong> {formatDateTime(current.createdAt)}</div>
        <div><strong>Updated:</strong> {formatDateTime(current.updatedAt)}</div>
        <div><strong>Last shown:</strong> {current.lastShownAt ? formatDateTime(current.lastShownAt) : "—"}</div>
        <div><strong>Last acted:</strong> {current.lastActedAt ? formatDateTime(current.lastActedAt) : "—"}</div>
      </section>

      {activeJourney ? <ResumeGuidedJourneyCard journey={activeJourney} /> : null}
    </div>
  );

  const edit = (
    <section style={cardStyles.bordered}>
      <h3 style={{ marginTop: 0 }}>Edit Obligation</h3>
      <EditObligationForm obligation={current} onSaved={setCurrent} />
    </section>
  );

  const history = <ObligationHistoryPanel obligationId={current.id} />;

  return (
    <>
      <main style={isMobile ? pageStyles.shellMobile : pageStyles.shell}>
        <div style={{ marginBottom: 20 }}>
          <Link href="/obligations" style={{ color: "#2563eb", textDecoration: "none" }}>
            ← Back to Obligations
          </Link>
        </div>

        <section style={cardStyles.section}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: isMobile ? "stretch" : "flex-start",
              flexDirection: isMobile ? "column" : "row",
              gap: 20,
              marginBottom: 20
            }}
          >
            <div>
              <h1 style={isMobile ? text.pageTitleMobile : text.pageTitle}>{current.title}</h1>
              <div style={{ color: colors.textMuted }}>
                {current.type} · {current.status}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(140px, max-content))",
                gap: 10
              }}
            >
              <button onClick={handleGuideMe} disabled={loading !== null} style={buttonStyles.primary}>
                {loading === "guide" ? "Starting..." : "Guide me"}
              </button>

              {current.status === "DRAFT" && current.source !== "MANUAL" ? (
                <Link href={`/obligations/${current.id}/review`} style={buttonStyles.link}>
                  Review draft
                </Link>
              ) : null}

              <button onClick={handleShowResolution} disabled={loading !== null} style={buttonStyles.secondary}>
                {loading === "resolution" ? "Loading..." : "Open resolution"}
              </button>

              <button onClick={handleMarkDone} disabled={loading !== null} style={buttonStyles.secondary}>
                {loading === "done" ? "Saving..." : "Mark done"}
              </button>

              <button onClick={handlePostpone} disabled={loading !== null} style={buttonStyles.secondary}>
                {loading === "postpone" ? "Saving..." : "Postpone 1 day"}
              </button>

              <button onClick={handleDismiss} disabled={loading !== null} style={buttonStyles.danger}>
                {loading === "dismiss" ? "Saving..." : "Dismiss"}
              </button>
            </div>
          </div>

          {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

          <ObligationDetailTabs
            overview={overview}
            edit={edit}
            history={history}
          />
        </section>
      </main>

      <ResolutionModal
        open={showResolution}
        onClose={() => setShowResolution(false)}
        resolution={resolution}
      />
    </>
  );
}
