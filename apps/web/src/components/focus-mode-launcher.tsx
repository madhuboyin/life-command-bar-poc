"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createFocusSession } from "../lib/api";
import type { FocusSession } from "../lib/types";
import { buttonStyles, cardStyles, colors, pageStyles } from "../lib/ui";
import FocusDurationSelector from "./focus-duration-selector";
import StatusMessage from "./ui/status-message";

type Props = {
  activeSession: FocusSession | null;
};

export default function FocusModeLauncher({ activeSession }: Props) {
  const [duration, setDuration] = useState<5 | 10 | 15>(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleCreate() {
    try {
      setLoading(true);
      setError(null);
      const created = await createFocusSession({
        durationMinutes: duration,
        sourceType: "FOCUS_MODE"
      });
      router.push(`/focus/${created.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Focus Mode");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to dashboard
        </Link>
      </div>

      <section style={{ ...cardStyles.section, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>Focus Mode</div>
        <h1 style={{ margin: "0 0 8px 0", fontSize: 32 }}>Clear a few meaningful items</h1>
        <p style={{ margin: 0, color: colors.textMuted }}>
          Choose a short session and we will prioritize the best items to handle right now.
        </p>
      </section>

      {activeSession && activeSession.state === "ACTIVE" ? (
        <section style={{ ...cardStyles.bordered, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
            Resume active session
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            {activeSession.summary.line}
          </div>
          <div style={{ color: colors.textMuted, marginBottom: 12 }}>
            {activeSession.remainingCount} item
            {activeSession.remainingCount === 1 ? "" : "s"} remaining in your{" "}
            {activeSession.durationMinutes}-minute session.
          </div>
          <Link
            href={`/focus/${activeSession.id}`}
            style={{
              ...buttonStyles.primary,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center"
            }}
          >
            Resume Focus Mode
          </Link>
        </section>
      ) : null}

      <section style={cardStyles.section}>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
          Session length
        </div>
        <FocusDurationSelector value={duration} onChange={setDuration} disabled={loading} />
        <div style={{ color: colors.textMuted, marginTop: 12, marginBottom: 14 }}>
          We will keep it realistic for this time box.
        </div>

        {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

        <button
          type="button"
          onClick={handleCreate}
          disabled={loading}
          style={{ ...buttonStyles.primary, width: "100%" }}
        >
          {loading ? "Preparing Focus Mode..." : `Start ${duration}-minute session`}
        </button>
      </section>
    </main>
  );
}
