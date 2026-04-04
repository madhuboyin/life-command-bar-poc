"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  abandonFocusSession,
  completeFocusSession,
  completeFocusSessionItem,
  createOrResumeGuidedJourney,
  dismissFocusSessionItem,
  nextFocusSessionItem,
  postponeFocusSessionItem,
  skipFocusSessionItem,
  startFocusSession
} from "../lib/api";
import { buildGuidedHref } from "../lib/flow-navigation";
import type { FocusSession } from "../lib/types";
import { buttonStyles, cardStyles, colors, pageStyles } from "../lib/ui";
import { useFlowSession } from "./flow-session-provider";
import FocusSessionCompleteCard from "./focus-session-complete-card";
import FocusSessionItemCard from "./focus-session-item-card";
import FocusSessionProgress from "./focus-session-progress";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";

type Props = {
  initialSession: FocusSession | null;
  sessionId: string;
  initialError?: string | null;
};

export default function FocusSessionShell({
  initialSession,
  sessionId,
  initialError = null
}: Props) {
  const [session, setSession] = useState<FocusSession | null>(initialSession);
  const [error, setError] = useState<string | null>(initialError);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const router = useRouter();
  const flow = useFlowSession();
  const { showToast } = useToast();

  useEffect(() => {
    if (!session || session.state !== "ACTIVE") return;
    if (session.startedAt) return;

    void (async () => {
      try {
        const started = await startFocusSession(sessionId);
        setSession(started.session);
      } catch {
        // Non-blocking start sync.
      }
    })();
  }, [session, sessionId]);

  const currentItem = session?.currentItem ?? null;
  const queuedItems = useMemo(
    () =>
      session?.items.filter(
        (item) =>
          item.status === "PENDING" && (!currentItem || item.obligationId !== currentItem.obligationId)
      ) ?? [],
    [session, currentItem]
  );

  async function updateSession(
    action: string,
    handler: () => Promise<{ session: FocusSession }>
  ) {
    try {
      setLoadingAction(action);
      setError(null);
      const updated = await handler();
      setSession(updated.session);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update focus session";
      setError(message);
      showToast({ variant: "error", title: "Focus Mode action failed", description: message });
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleStartGuided() {
    if (!session || !currentItem) return;

    try {
      setLoadingAction("guided");
      setError(null);

      const journey = await createOrResumeGuidedJourney(currentItem.obligationId);
      const flowSession = await flow.startSession({
        sourceType: "FOCUS_MODE",
        sourceContext: {
          label: "Focus Mode",
          returnPath: `/focus/${session.id}`,
          obligationIds: session.items.map((item) => item.obligationId)
        },
        currentObligationId: currentItem.obligationId,
        currentJourneyId: journey.journey.id
      });

      router.push(buildGuidedHref(journey.journey.id, flowSession.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not open guided flow";
      setError(message);
      showToast({ variant: "error", title: "Guided flow failed", description: message });
    } finally {
      setLoadingAction(null);
    }
  }

  if (!session) {
    return (
      <main style={pageStyles.shell}>
        <div style={{ marginBottom: 20 }}>
          <Link href="/focus" style={{ color: "#2563eb", textDecoration: "none" }}>
            ← Back to Focus Mode
          </Link>
        </div>
        <StatusMessage variant="error">
          {error ?? "Focus session could not be loaded."}
        </StatusMessage>
      </main>
    );
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/focus" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to Focus Mode
        </Link>
      </div>

      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
          Focus session
        </div>
        <h1 style={{ margin: "0 0 6px 0", fontSize: 32 }}>
          {session.durationMinutes}-minute session
        </h1>
        <p style={{ margin: 0, color: colors.textMuted }}>
          Stay in this contained flow and clear a few meaningful items.
        </p>
      </header>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      <div style={{ display: "grid", gap: 14 }}>
        <FocusSessionProgress
          line={session.summary.line}
          progressPercent={session.progressPercent}
          remainingCount={session.remainingCount}
        />

        {session.state === "COMPLETED" || session.remainingCount === 0 ? (
          <FocusSessionCompleteCard completionMessage={session.summary.completionMessage} />
        ) : currentItem ? (
          <FocusSessionItemCard
            item={currentItem}
            loadingAction={loadingAction}
            onStartGuided={handleStartGuided}
            onComplete={() =>
              updateSession("complete", () =>
                completeFocusSessionItem(session.id, currentItem.obligationId)
              )
            }
            onPostpone={() =>
              updateSession("postpone", () =>
                postponeFocusSessionItem(session.id, currentItem.obligationId)
              )
            }
            onDismiss={() =>
              updateSession("dismiss", () =>
                dismissFocusSessionItem(session.id, currentItem.obligationId, "dismissed_from_focus_mode")
              )
            }
            onSkip={() =>
              updateSession("skip", () =>
                skipFocusSessionItem(session.id, currentItem.obligationId)
              )
            }
          />
        ) : (
          <section style={cardStyles.section}>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>No active item right now</h2>
            <p style={{ color: colors.textMuted, marginTop: 0 }}>
              Move to the next best item in this session.
            </p>
            <button
              type="button"
              onClick={() => updateSession("next", () => nextFocusSessionItem(session.id))}
              disabled={loadingAction !== null}
              style={buttonStyles.primary}
            >
              {loadingAction === "next" ? "Loading..." : "Next item"}
            </button>
          </section>
        )}

        {queuedItems.length > 0 ? (
          <section style={cardStyles.bordered}>
            <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
              Up next
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {queuedItems.slice(0, 3).map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{item.title}</span>
                  <span style={{ color: colors.textMuted, fontSize: 13 }}>
                    ~{item.estimatedMinutes}m
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {session.state === "ACTIVE" ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => updateSession("next", () => nextFocusSessionItem(session.id))}
              disabled={loadingAction !== null}
              style={buttonStyles.secondary}
            >
              {loadingAction === "next" ? "Loading..." : "Move to next item"}
            </button>
            <button
              type="button"
              onClick={() => updateSession("complete-session", () => completeFocusSession(session.id))}
              disabled={loadingAction !== null}
              style={buttonStyles.secondary}
            >
              {loadingAction === "complete-session" ? "Saving..." : "Complete session"}
            </button>
            <button
              type="button"
              onClick={() => updateSession("abandon", () => abandonFocusSession(session.id))}
              disabled={loadingAction !== null}
              style={buttonStyles.danger}
            >
              {loadingAction === "abandon" ? "Saving..." : "Abandon session"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/focus" style={buttonStyles.link}>
              Start another session
            </Link>
            <Link href="/" style={buttonStyles.link}>
              Return to dashboard
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
