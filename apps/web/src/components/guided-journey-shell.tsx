"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  abandonGuidedJourney,
  advanceGuidedJourney,
  createOrResumeGuidedJourney,
  backGuidedJourney,
  completeGuidedJourney,
  createOutcomeFeedback,
  dismissGuidedJourney,
  selectGuidedJourneyOption
} from "../lib/api";
import { buildGuidedHref, getFlowReturnPath, getSourceLabel } from "../lib/flow-navigation";
import type { FlowSession, GuidedJourney } from "../lib/types";
import { buttonStyles, cardStyles, colors, pageStyles, text } from "../lib/ui";
import { buildActionLabel } from "../lib/human-language.service";
import { useFlowSession } from "./flow-session-provider";
import GuidedProgress from "./guided-progress";
import GuidedStepCard from "./guided-step-card";
import OutcomeFeedbackPrompt from "./outcome-feedback-prompt";
import EmptyState from "./ui/empty-state";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";
import WhyThisExplanation from "./why-this-explanation";

type Props = {
  initialJourney: GuidedJourney | null;
  initialFlowSession?: FlowSession | null;
  flowSessionId?: string | null;
  initialError?: string | null;
};

export default function GuidedJourneyShell({
  initialJourney,
  initialFlowSession = null,
  flowSessionId = null,
  initialError = null
}: Props) {
  const [journey, setJourney] = useState<GuidedJourney | null>(initialJourney);
  const [flowSession, setFlowSession] = useState<FlowSession | null>(initialFlowSession);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState<string | null>(null);
  const [helpfulnessSubmitted, setHelpfulnessSubmitted] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();
  const flow = useFlowSession();

  useEffect(() => {
    setHelpfulnessSubmitted(false);
  }, [journey?.id]);

  useEffect(() => {
    if (initialFlowSession) {
      flow.setActiveSession(initialFlowSession);
    }
  }, [flow, initialFlowSession]);

  const backHref = useMemo(() => {
    if (flowSession) return getFlowReturnPath(flowSession);
    if (journey) return `/obligations/${journey.obligationId}`;
    return "/obligations";
  }, [flowSession, journey]);
  const isFocusFlow = flowSession?.sourceType === "FOCUS_MODE";

  async function syncFlowCompletion(nextJourney: GuidedJourney) {
    if (!flowSessionId) return;
    if (nextJourney.status !== "COMPLETED") return;

    try {
      const nextSession = await flow.completeStep(flowSessionId, {
        obligationId: nextJourney.obligationId,
        journeyId: nextJourney.id
      });
      setFlowSession(nextSession);
    } catch {
      // Keep journey flow usable even if flow-session sync fails.
    }
  }

  async function handleSelectOption(optionKey: string) {
    if (!journey) return;

    try {
      setLoading("select");
      setError(null);
      const data = await selectGuidedJourneyOption(journey.id, optionKey);
      setJourney(data.journey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not select option";
      setError(message);
      showToast({ variant: "error", title: "Selection failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleAdvance() {
    if (!journey) return;

    try {
      setLoading("advance");
      setError(null);
      const data = await advanceGuidedJourney(journey.id, true);
      setJourney(data.journey);
      await syncFlowCompletion(data.journey);

      showToast({
        variant: "success",
        title: data.journey.status === "COMPLETED" ? "Journey completed" : "Moved to next step"
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not advance journey";
      setError(message);
      showToast({ variant: "error", title: "Advance failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleBack() {
    if (!journey) return;

    try {
      setLoading("back");
      setError(null);
      const data = await backGuidedJourney(journey.id);
      setJourney(data.journey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not go back";
      setError(message);
      showToast({ variant: "error", title: "Back failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleComplete() {
    if (!journey) return;

    try {
      setLoading("complete");
      setError(null);
      const data = await completeGuidedJourney(journey.id);
      setJourney(data.journey);
      await syncFlowCompletion(data.journey);
      showToast({ variant: "success", title: "Journey completed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not complete journey";
      setError(message);
      showToast({ variant: "error", title: "Complete failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleAbandon() {
    if (!journey) return;

    try {
      setLoading("abandon");
      setError(null);
      const data = await abandonGuidedJourney(journey.id);
      setJourney(data.journey);
      if (flowSessionId) {
        const nextSession = await flow.abandon(flowSessionId);
        setFlowSession(nextSession);
      }
      showToast({ variant: "success", title: "Journey abandoned" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not abandon journey";
      setError(message);
      showToast({ variant: "error", title: "Abandon failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleDismiss() {
    if (!journey) return;

    try {
      setLoading("dismiss");
      setError(null);
      const data = await dismissGuidedJourney(journey.id);
      setJourney(data.journey);
      if (flowSessionId) {
        const nextSession = await flow.abandon(flowSessionId);
        setFlowSession(nextSession);
      }
      showToast({ variant: "success", title: "Journey dismissed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not dismiss journey";
      setError(message);
      showToast({ variant: "error", title: "Dismiss failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleHelpfulness(helpful: boolean) {
    if (!journey) return;

    try {
      setLoading("helpful");
      setError(null);

      await createOutcomeFeedback({
        obligationId: journey.obligationId,
        guidedJourneyId: journey.id,
        sourceContext: "GUIDED_MODE",
        selectedActionKey: helpful ? "helpful_yes" : "helpful_no",
        outcomeType: helpful ? "HELPFUL" : "NOT_HELPFUL",
        note: helpful
          ? "User said guided journey was helpful."
          : "User said guided journey was not very helpful."
      });

      setHelpfulnessSubmitted(true);
      showToast({
        variant: "success",
        title: "Feedback saved"
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save feedback";
      setError(message);
      showToast({ variant: "error", title: "Feedback failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleNextItem() {
    if (!flowSessionId) return;

    try {
      setLoading("next-item");
      setError(null);

      const moved = await flow.moveNext(flowSessionId);
      setFlowSession(moved);

      if (!moved.currentObligationId) {
        showToast({ variant: "info", title: "You are done for now" });
        return;
      }

      const journeyData = await createOrResumeGuidedJourney(moved.currentObligationId);
      await flow.startSession({
        sessionId: moved.id,
        sourceType: moved.sourceType,
        sourceContext: moved.sourceContext ?? undefined,
        currentObligationId: moved.currentObligationId,
        currentJourneyId: journeyData.journey.id
      });

      router.push(buildGuidedHref(journeyData.journey.id, moved.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load next item";
      setError(message);
      showToast({ variant: "error", title: "Next item failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 18 }}>
        <Link href={backHref} style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back
        </Link>
      </div>

      <header style={{ marginBottom: 20 }}>
        <h1 style={text.pageTitle}>Guided Mode</h1>
        <p style={text.bodyMuted}>
          A calm step-by-step path so you always know what to do next.
        </p>
      </header>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      {!journey ? (
        <EmptyState
          title="Guided journey not available"
          description="This journey could not be loaded. Please try again from the item page."
          action={
            <Link href="/obligations" style={{ ...buttonStyles.link, color: colors.text }}>
              Go to obligations
            </Link>
          }
        />
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {flowSession ? (
            <section style={cardStyles.bordered}>
              <div style={text.label}>{getSourceLabel(flowSession.sourceType)}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                {flowSession.summary.handledCount} of {flowSession.summary.totalItems} handled
              </div>
              <div style={{ fontSize: 13, color: colors.textMuted }}>
                {flowSession.summary.remainingCount > 0
                  ? `${flowSession.summary.remainingCount} item${flowSession.summary.remainingCount === 1 ? "" : "s"} remaining in this flow.`
                  : "No remaining items in this flow."}
              </div>
            </section>
          ) : null}

          <section style={cardStyles.bordered}>
            <div style={text.label}>Journey summary</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              {journey.summary ?? "Guided resolution journey"}
            </div>
            {journey.recommendedPath ? (
              <div style={{ color: colors.textMuted }}>{journey.recommendedPath}</div>
            ) : null}
            <div style={{ marginTop: 10 }}>
              <WhyThisExplanation why={journey.why} decisionTrace={journey.decisionTrace} />
            </div>
          </section>

          <section style={cardStyles.bordered}>
            <GuidedProgress
              currentStepIndex={journey.currentStepIndex}
              totalSteps={journey.totalSteps}
              progressPercent={journey.progressPercent}
            />
          </section>

          {journey.status === "ACTIVE" && journey.currentStep ? (
            <GuidedStepCard
              step={journey.currentStep}
              loading={loading !== null}
              onSelectOption={handleSelectOption}
            />
          ) : (
            <section style={cardStyles.section}>
              <div style={text.label}>Journey status</div>
              <h2 style={{ marginTop: 0 }}>
                {journey.status === "COMPLETED"
                  ? "Journey completed"
                  : journey.status === "ABANDONED"
                    ? "Journey abandoned"
                    : "Journey dismissed"}
              </h2>
              <p style={{ color: colors.textMuted, marginBottom: 0 }}>
                {flowSession?.state === "COMPLETED"
                  ? "You are done for now in this flow."
                  : isFocusFlow
                    ? "Return to Focus Mode to continue the session."
                    : "You can move to the next item or return to your previous context."}
              </p>
            </section>
          )}

          {journey.status !== "ACTIVE" &&
          flowSession?.state === "ACTIVE" &&
          flowSession.nextItem &&
          !isFocusFlow ? (
            <section style={cardStyles.bordered}>
              <div style={text.label}>Next item</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>
                Next: {flowSession.nextItem.title}
              </div>
              <button
                type="button"
                onClick={handleNextItem}
                disabled={loading !== null}
                style={buttonStyles.primary}
              >
                {loading === "next-item" ? "Loading..." : "Continue to next item"}
              </button>
            </section>
          ) : null}

          {journey.status !== "ACTIVE" && flowSession?.state === "COMPLETED" ? (
            <section style={cardStyles.bordered}>
              <div style={text.label}>Done for now</div>
              <h3 style={{ marginTop: 0 }}>You&apos;re done for now.</h3>
              <p style={{ color: colors.textMuted }}>
                You handled {flowSession.summary.handledCount} item
                {flowSession.summary.handledCount === 1 ? "" : "s"} in this flow.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href={getFlowReturnPath(flowSession)} style={buttonStyles.link}>
                  Return to source
                </Link>
                <Link href="/" style={buttonStyles.link}>
                  Dashboard
                </Link>
                <Link href="/obligations" style={buttonStyles.link}>
                  {buildActionLabel("details")}
                </Link>
              </div>
            </section>
          ) : null}

          {journey.status !== "ACTIVE" && isFocusFlow ? (
            <section style={cardStyles.bordered}>
              <div style={text.label}>Focus Mode</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>
                Return to your focus session to continue with the next item.
              </div>
              <Link
                href={backHref}
                style={{
                  ...buttonStyles.primary,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center"
                }}
              >
                Back to Focus Mode
              </Link>
            </section>
          ) : null}

          {journey.status !== "ACTIVE" ? (
            <OutcomeFeedbackPrompt
              loading={loading === "helpful"}
              submitted={helpfulnessSubmitted}
              onHelpful={async () => handleHelpfulness(true)}
              onNotHelpful={async () => handleHelpfulness(false)}
            />
          ) : null}

          <section style={cardStyles.bordered}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, max-content))",
                gap: 10
              }}
            >
              {journey.status === "ACTIVE" ? (
                <>
                  <button
                    onClick={handleBack}
                    disabled={loading !== null || journey.currentStepIndex === 0}
                    style={buttonStyles.secondary}
                  >
                    {loading === "back" ? "Working..." : "Back"}
                  </button>

                  <button
                    onClick={handleAdvance}
                    disabled={loading !== null}
                    style={buttonStyles.primary}
                  >
                    {loading === "advance"
                      ? "Working..."
                      : journey.currentStepIndex >= journey.totalSteps - 1
                        ? "Finish step"
                        : "Next step"}
                  </button>

                  <button
                    onClick={handleComplete}
                    disabled={loading !== null}
                    style={buttonStyles.secondary}
                  >
                    {loading === "complete" ? "Working..." : "Complete journey"}
                  </button>

                  <button
                    onClick={handleAbandon}
                    disabled={loading !== null}
                    style={buttonStyles.secondary}
                  >
                    {loading === "abandon" ? "Working..." : "Abandon"}
                  </button>

                  <button
                    onClick={handleDismiss}
                    disabled={loading !== null}
                    style={buttonStyles.danger}
                  >
                    {loading === "dismiss" ? "Working..." : buildActionLabel("ignore")}
                  </button>
                </>
              ) : (
                <Link href={backHref} style={buttonStyles.link}>
                  Return
                </Link>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
