"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  abandonGuidedJourney,
  advanceGuidedJourney,
  backGuidedJourney,
  completeGuidedJourney,
  createOutcomeFeedback,
  dismissGuidedJourney,
  selectGuidedJourneyOption
} from "../lib/api";
import type { GuidedJourney } from "../lib/types";
import {
  buttonStyles,
  cardStyles,
  colors,
  pageStyles,
  text
} from "../lib/ui";
import GuidedProgress from "./guided-progress";
import GuidedStepCard from "./guided-step-card";
import EmptyState from "./ui/empty-state";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";
import OutcomeFeedbackPrompt from "./outcome-feedback-prompt";

type Props = {
  initialJourney: GuidedJourney | null;
  initialError?: string | null;
};

export default function GuidedJourneyShell({
  initialJourney,
  initialError = null
}: Props) {
  const [journey, setJourney] = useState<GuidedJourney | null>(initialJourney);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState<string | null>(null);
  const [helpfulnessSubmitted, setHelpfulnessSubmitted] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    setHelpfulnessSubmitted(false);
  }, [journey?.id]);

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

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 18 }}>
        <Link href={journey ? `/obligations/${journey.obligationId}` : "/obligations"} style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to obligation
        </Link>
      </div>

      <header style={{ marginBottom: 20 }}>
        <h1 style={text.pageTitle}>Guided Mode</h1>
        <p style={text.bodyMuted}>
          A deterministic, step-by-step path to resolve this obligation with intention.
        </p>
      </header>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      {!journey ? (
        <EmptyState
          title="Guided journey not available"
          description="This journey could not be loaded. Try returning to the obligation and starting Guided Mode again."
          action={
            <Link href="/obligations" style={{ ...buttonStyles.link, color: colors.text }}>
              Go to obligations
            </Link>
          }
        />
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <section style={cardStyles.bordered}>
            <div style={text.label}>Journey summary</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              {journey.summary ?? "Guided resolution journey"}
            </div>
            {journey.recommendedPath ? (
              <div style={{ color: colors.textMuted }}>{journey.recommendedPath}</div>
            ) : null}
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
                You can return to the obligation details for next actions.
              </p>
            </section>
          )}

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
                    {loading === "dismiss" ? "Working..." : "Dismiss journey"}
                  </button>
                </>
              ) : (
                <Link href={`/obligations/${journey.obligationId}`} style={buttonStyles.link}>
                  Return to obligation
                </Link>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
