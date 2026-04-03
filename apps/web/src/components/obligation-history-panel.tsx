"use client";

import { useCallback, useEffect, useState } from "react";
import { getObligationHistory } from "../lib/api";
import type { ObligationHistory } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";
import LoadingCard from "./ui/loading-card";
import EmptyState from "./ui/empty-state";
import StatusMessage from "./ui/status-message";

type Props = {
  obligationId: string;
};

export default function ObligationHistoryPanel({ obligationId }: Props) {
  const [history, setHistory] = useState<ObligationHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getObligationHistory(obligationId);
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [obligationId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <LoadingCard title="Loading history..." lines={3} />
        <LoadingCard title="Loading history..." lines={2} />
      </div>
    );
  }

  if (error) {
    return <StatusMessage variant="error">{error}</StatusMessage>;
  }

  const totalCount =
    (history?.auditEvents.length ?? 0) +
    (history?.feedbackEvents.length ?? 0) +
    (history?.resolutionRuns.length ?? 0) +
    (history?.reminders.length ?? 0) +
    (history?.guidedJourneyEvents.length ?? 0) +
    (history?.guidedJourneys.length ?? 0);

  if (!history || totalCount === 0) {
    return (
      <EmptyState
        title="No history yet"
        description="Actions, feedback, reminders, and resolution runs will appear here."
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={cardStyles.bordered}>
        <h3 style={{ marginTop: 0 }}>Audit Events</h3>
        {history.auditEvents.length === 0 ? (
          <div style={{ color: colors.textMuted }}>No audit events.</div>
        ) : (
          history.auditEvents.map((item) => (
            <div key={item.id} style={eventRow}>
              <div style={{ fontWeight: 600 }}>{item.eventType}</div>
              <div style={metaText}>{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          ))
        )}
      </section>

      <section style={cardStyles.bordered}>
        <h3 style={{ marginTop: 0 }}>Feedback Events</h3>
        {history.feedbackEvents.length === 0 ? (
          <div style={{ color: colors.textMuted }}>No feedback events.</div>
        ) : (
          history.feedbackEvents.map((item) => (
            <div key={item.id} style={eventRow}>
              <div style={{ fontWeight: 600 }}>{item.type}</div>
              {item.note ? <div>{item.note}</div> : null}
              <div style={metaText}>{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          ))
        )}
      </section>

      <section style={cardStyles.bordered}>
        <h3 style={{ marginTop: 0 }}>Resolution Runs</h3>
        {history.resolutionRuns.length === 0 ? (
          <div style={{ color: colors.textMuted }}>No resolution runs.</div>
        ) : (
          history.resolutionRuns.map((item) => (
            <div key={item.id} style={eventRow}>
              <div style={{ fontWeight: 600 }}>{item.flowKey}</div>
              <div>Recommended: {item.recommendedOption}</div>
              <div>Confidence: {item.confidence}</div>
              <div style={metaText}>{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          ))
        )}
      </section>

      <section style={cardStyles.bordered}>
        <h3 style={{ marginTop: 0 }}>Reminders</h3>
        {history.reminders.length === 0 ? (
          <div style={{ color: colors.textMuted }}>No reminders linked.</div>
        ) : (
          history.reminders.map((item) => (
            <div key={item.id} style={eventRow}>
              <div style={{ fontWeight: 600 }}>{item.title}</div>
              <div>Status: {item.status}</div>
              <div>Scheduled: {new Date(item.scheduledFor).toLocaleString()}</div>
            </div>
          ))
        )}
      </section>

      <section style={cardStyles.bordered}>
        <h3 style={{ marginTop: 0 }}>Guided Journeys</h3>
        {history.guidedJourneys.length === 0 ? (
          <div style={{ color: colors.textMuted }}>No guided journeys yet.</div>
        ) : (
          history.guidedJourneys.map((item) => (
            <div key={item.id} style={eventRow}>
              <div style={{ fontWeight: 600 }}>
                {item.journeyType} · {item.status}
              </div>
              <div>
                Progress: {item.completedSteps}/{item.totalSteps} steps completed
              </div>
              <div style={metaText}>Updated: {new Date(item.updatedAt).toLocaleString()}</div>
            </div>
          ))
        )}
      </section>

      <section style={cardStyles.bordered}>
        <h3 style={{ marginTop: 0 }}>Guided Journey Events</h3>
        {history.guidedJourneyEvents.length === 0 ? (
          <div style={{ color: colors.textMuted }}>No guided journey events.</div>
        ) : (
          history.guidedJourneyEvents.map((item) => (
            <div key={item.id} style={eventRow}>
              <div style={{ fontWeight: 600 }}>{item.eventType}</div>
              <div style={{ fontSize: 12, color: colors.textMuted }}>
                Journey: {item.journeyId}
              </div>
              <div style={metaText}>{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

const eventRow: React.CSSProperties = {
  padding: "10px 0",
  borderTop: "1px solid #e5e7eb"
};

const metaText: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 4
};
