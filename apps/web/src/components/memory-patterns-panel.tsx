"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteMemoryPattern,
  getMemoryPatterns,
  updateMemoryPattern
} from "../lib/api";
import type { MemoryPattern, Obligation } from "../lib/types";
import { buttonStyles, cardStyles, colors, inputStyles } from "../lib/ui";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";

type Props = {
  obligation: Obligation;
};

type SaveState = {
  loading: boolean;
  error: string | null;
};

const recurrenceOptions = ["WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY", "IRREGULAR"] as const;

export default function MemoryPatternsPanel({ obligation }: Props) {
  const { showToast } = useToast();
  const [patterns, setPatterns] = useState<MemoryPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStateById, setSaveStateById] = useState<Record<string, SaveState>>({});
  const [recurrenceDraftById, setRecurrenceDraftById] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await getMemoryPatterns({ includeSuppressed: true, limit: 300 });
        if (!cancelled) {
          setPatterns(data.items);
          setRecurrenceDraftById(buildInitialRecurrenceDrafts(data.items));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load memory patterns");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const recurringMatches = useMemo(() => {
    const vendorKey = obligation.vendor ? normalizeKey(obligation.vendor) : null;
    return patterns.filter((pattern) => {
      if (pattern.patternType !== "RECURRING_OBLIGATION") return false;
      const data = asRecord(pattern.patternData);
      const patternVendorKey = toStringOrNull(data?.vendorKey);
      const patternType = toStringOrNull(data?.obligationType);
      if (!patternVendorKey || !vendorKey) return false;
      return patternVendorKey === vendorKey && patternType === obligation.type;
    });
  }, [patterns, obligation.vendor, obligation.type]);

  const behaviorPattern = useMemo(
    () =>
      patterns.find(
        (pattern) =>
          pattern.patternType === "USER_BEHAVIOR" && pattern.referenceId === "behavior:profile"
      ) ?? null,
    [patterns]
  );

  async function handleSaveRecurrence(pattern: MemoryPattern) {
    const nextRecurrence = recurrenceDraftById[pattern.id];
    if (!nextRecurrence) return;
    const data = asRecord(pattern.patternData) ?? {};
    const nextPatternData = {
      ...data,
      recurrenceType: nextRecurrence,
      reason: `Recurrence manually set to ${nextRecurrence.toLowerCase()}.`
    };
    await runPatternAction(pattern.id, async () => {
      const updated = await updateMemoryPattern(pattern.id, {
        patternData: nextPatternData,
        isUserLocked: true
      });
      setPatterns((current) =>
        current.map((item) => (item.id === pattern.id ? updated.pattern : item))
      );
      showToast({
        variant: "success",
        title: "Pattern updated",
        description: "Recurrence preference saved."
      });
    });
  }

  async function handleToggleSuppress(pattern: MemoryPattern) {
    await runPatternAction(pattern.id, async () => {
      const updated = await updateMemoryPattern(pattern.id, {
        isSuppressed: !pattern.isSuppressed,
        isUserLocked: true
      });
      setPatterns((current) =>
        current.map((item) => (item.id === pattern.id ? updated.pattern : item))
      );
      showToast({
        variant: "success",
        title: pattern.isSuppressed ? "Pattern restored" : "Pattern suppressed",
        description: pattern.isSuppressed
          ? "This pattern is active again."
          : "This pattern will no longer drive recommendations."
      });
    });
  }

  async function handleDeletePattern(pattern: MemoryPattern) {
    await runPatternAction(pattern.id, async () => {
      await deleteMemoryPattern(pattern.id);
      setPatterns((current) => current.filter((item) => item.id !== pattern.id));
      showToast({
        variant: "success",
        title: "Pattern removed",
        description: "The memory pattern was deleted."
      });
    });
  }

  async function runPatternAction(patternId: string, action: () => Promise<void>) {
    try {
      setSaveStateById((current) => ({
        ...current,
        [patternId]: { loading: true, error: null }
      }));
      await action();
    } catch (actionError) {
      const message =
        actionError instanceof Error ? actionError.message : "Could not update pattern";
      setSaveStateById((current) => ({
        ...current,
        [patternId]: { loading: false, error: message }
      }));
      showToast({ variant: "error", title: "Pattern update failed", description: message });
      return;
    }

    setSaveStateById((current) => ({
      ...current,
      [patternId]: { loading: false, error: null }
    }));
  }

  const behaviorLabels = extractBehaviorLabels(behaviorPattern);

  async function handleResetBehavior() {
    if (!behaviorPattern) return;
    const data = asRecord(behaviorPattern.patternData) ?? {};
    await runPatternAction(behaviorPattern.id, async () => {
      const updated = await updateMemoryPattern(behaviorPattern.id, {
        patternData: {
          ...data,
          labels: ["balanced"],
          reason: "Behavior profile manually set to balanced."
        },
        isUserLocked: true
      });
      setPatterns((current) =>
        current.map((item) => (item.id === behaviorPattern.id ? updated.pattern : item))
      );
      showToast({
        variant: "success",
        title: "Behavior profile updated",
        description: "Behavior assumptions were reset to balanced."
      });
    });
  }

  return (
    <section style={cardStyles.bordered}>
      <h3 style={{ marginTop: 0 }}>Home Memory</h3>
      <p style={{ marginTop: 0, color: colors.textMuted, fontSize: 14 }}>
        Pattern signals derived from your real behavior. You can override or remove these anytime.
      </p>

      {loading ? <div style={{ color: colors.textMuted, fontSize: 14 }}>Loading memory…</div> : null}
      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      {!loading ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, color: colors.textMuted }}>
            Behavior profile:{" "}
            {behaviorLabels.length > 0 ? behaviorLabels.join(" · ") : "Not enough data yet"}
          </div>
          {behaviorPattern ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleResetBehavior}
                disabled={saveStateById[behaviorPattern.id]?.loading === true}
                style={buttonStyles.secondary}
              >
                Set behavior to balanced
              </button>
              <button
                type="button"
                onClick={() => handleToggleSuppress(behaviorPattern)}
                disabled={saveStateById[behaviorPattern.id]?.loading === true}
                style={buttonStyles.secondary}
              >
                {behaviorPattern.isSuppressed
                  ? "Restore behavior pattern"
                  : "Suppress behavior pattern"}
              </button>
            </div>
          ) : null}

          {recurringMatches.length === 0 ? (
            <div style={{ fontSize: 13, color: colors.textMuted }}>
              No recurring memory pattern is linked to this obligation yet.
            </div>
          ) : (
            recurringMatches.map((pattern) => {
              const data = asRecord(pattern.patternData);
              const reason = toStringOrNull(data?.reason) ?? "Recurring pattern detected.";
              const recurrenceType = toStringOrNull(data?.recurrenceType) ?? "IRREGULAR";
              const saveState = saveStateById[pattern.id] ?? { loading: false, error: null };

              return (
                <article
                  key={pattern.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: 12,
                    background: pattern.isSuppressed ? "#f8fafc" : "#ffffff"
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {toStringOrNull(data?.vendor) ?? obligation.vendor ?? obligation.title}
                  </div>
                  <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8 }}>
                    {reason}
                  </div>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
                    Confidence {Math.round(pattern.confidence * 100)}% · Observed {pattern.frequency} times
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      gridTemplateColumns: "minmax(140px, 180px) repeat(auto-fit, minmax(120px, max-content))"
                    }}
                  >
                    <select
                      value={recurrenceDraftById[pattern.id] ?? recurrenceType}
                      onChange={(event) =>
                        setRecurrenceDraftById((current) => ({
                          ...current,
                          [pattern.id]: event.target.value
                        }))
                      }
                      style={inputStyles.input}
                      disabled={saveState.loading}
                    >
                      {recurrenceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => handleSaveRecurrence(pattern)}
                      disabled={saveState.loading}
                      style={buttonStyles.secondary}
                    >
                      {saveState.loading ? "Saving..." : "Save recurrence"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleSuppress(pattern)}
                      disabled={saveState.loading}
                      style={buttonStyles.secondary}
                    >
                      {pattern.isSuppressed ? "Restore pattern" : "Suppress pattern"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeletePattern(pattern)}
                      disabled={saveState.loading}
                      style={buttonStyles.danger}
                    >
                      Remove pattern
                    </button>
                  </div>

                  {saveState.error ? (
                    <StatusMessage variant="error">{saveState.error}</StatusMessage>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
}

function extractBehaviorLabels(pattern: MemoryPattern | null) {
  if (!pattern) return [];
  const data = asRecord(pattern.patternData);
  if (!Array.isArray(data?.labels)) return [];
  return data.labels.filter((item): item is string => typeof item === "string");
}

function buildInitialRecurrenceDrafts(patterns: MemoryPattern[]) {
  const next: Record<string, string> = {};
  for (const pattern of patterns) {
    if (pattern.patternType !== "RECURRING_OBLIGATION") continue;
    const data = asRecord(pattern.patternData);
    const recurrenceType = toStringOrNull(data?.recurrenceType);
    if (recurrenceType) {
      next[pattern.id] = recurrenceType;
    }
  }
  return next;
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}
