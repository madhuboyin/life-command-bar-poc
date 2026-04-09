"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  archiveTrackedAnchor,
  cancelTrackedAnchor,
  getTrackedAnchors,
  pauseTrackedAnchor,
  snoozeTrackedAnchor,
  updateTrackedAnchor
} from "../lib/api";
import type { TrackedAnchorItem } from "../lib/types";
import {
  buttonStyles,
  cardStyles,
  colors,
  inputStyles,
  radius
} from "../lib/ui";
import TrackedAnchorAddFlow from "./tracked-anchor-add-flow";
import { useToast } from "./ui/toast-provider";
import EmptyState from "./ui/empty-state";
import LoadingCard from "./ui/loading-card";
import SectionCard from "./ui/section-card";
import StatusMessage from "./ui/status-message";

type Props = {
  initialItems?: TrackedAnchorItem[];
};

type EditCadence = "MONTHLY" | "YEARLY" | "ONE_TIME" | "NOT_SURE";

export default function TrackedAnchorManagerPanel({
  initialItems = []
}: Props) {
  const [items, setItems] = useState<TrackedAnchorItem[]>(initialItems);
  const [loading, setLoading] = useState(initialItems.length === 0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    label: string;
    category: TrackedAnchorItem["category"];
    cadence: EditCadence;
    nextExpectedDate: string;
    expectedAmount: string;
    currencyCode: string;
    notes: string;
  } | null>(null);
  const { showToast } = useToast();

  const activeCount = useMemo(
    () => items.filter((item) => item.status === "ACTIVE").length,
    [items]
  );

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const response = await getTrackedAnchors({ status: "ALL" });
      setItems(response.items);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load tracked items right now."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialItems.length > 0) return;
    void load();
  }, [initialItems.length]);

  async function runAction(
    anchorId: string,
    action: () => Promise<unknown>,
    successTitle: string
  ) {
    try {
      setSavingId(anchorId);
      setError(null);
      await action();
      await load();
      showToast({ variant: "success", title: successTitle });
    } catch (actionError) {
      const message =
        actionError instanceof Error
          ? actionError.message
          : "Could not update this yet.";
      setError(message);
      showToast({
        variant: "error",
        title: "Update failed",
        description: message
      });
    } finally {
      setSavingId(null);
    }
  }

  function startEditing(item: TrackedAnchorItem) {
    setEditingId(item.id);
    setEditForm({
      label: item.label,
      category: item.category,
      cadence: cadenceFromItem(item),
      nextExpectedDate: item.nextExpectedDate?.slice(0, 10) ?? "",
      expectedAmount:
        item.expectedAmount === null ? "" : String(item.expectedAmount),
      currencyCode: item.currencyCode ?? "USD",
      notes: item.notes ?? ""
    });
  }

  async function saveEdit(item: TrackedAnchorItem) {
    if (!editForm) return;
    const recurrence = mapCadenceToRecurrence(editForm.cadence);
    const nextExpectedDate = editForm.nextExpectedDate
      ? `${editForm.nextExpectedDate}T12:00:00.000Z`
      : null;

    await runAction(
      item.id,
      async () =>
        updateTrackedAnchor(item.id, {
          label: editForm.label.trim(),
          category: editForm.category,
          recurrenceType: recurrence.recurrenceType,
          recurrenceInterval: recurrence.recurrenceInterval,
          recurrenceUnit: recurrence.recurrenceUnit,
          nextExpectedDate,
          expectedAmount: editForm.expectedAmount
            ? Number(editForm.expectedAmount)
            : null,
          currencyCode: editForm.currencyCode.trim().toUpperCase() || null,
          notes: editForm.notes.trim() || null
        }),
      "Updated and still watching this"
    );

    setEditingId(null);
    setEditForm(null);
  }

  return (
    <SectionCard
      title="Things We're Watching"
      description="Quick control over the items we're keeping an eye on for you."
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={countPillStyle}>
          Active now: {activeCount}
        </span>
        <TrackedAnchorAddFlow
          triggerLabel="Track one more thing"
          triggerStyle="secondary"
          onCreated={() => void load()}
        />
      </div>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      {loading ? (
        <div style={{ display: "grid", gap: 10 }}>
          <LoadingCard title="Loading watched items..." lines={2} />
          <LoadingCard title="Loading watched items..." lines={2} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing tracked yet"
          description="Add one important thing and we'll keep watching it for you."
          action={
            <TrackedAnchorAddFlow
              triggerLabel="Add something to watch"
              triggerStyle="primary"
              onCreated={() => void load()}
            />
          }
        />
      ) : (
        <div id="watch-list" style={{ display: "grid", gap: 10 }}>
          {items.map((item) => {
            const isSaving = savingId === item.id;
            const isEditing = editingId === item.id && editForm;
            return (
              <article
                key={item.id}
                style={{ ...cardStyles.bordered, display: "grid", gap: 10 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{item.label}</div>
                    <div style={{ color: colors.textMuted, fontSize: 13 }}>
                      {item.categoryLabel} · {item.cadenceLabel}
                    </div>
                  </div>
                  <span style={statusPill(item.status)}>{item.statusLabel}</span>
                </div>

                <div style={{ fontSize: 13, color: colors.textMuted }}>
                  {item.timingSummary ?? "We'll keep watching this for timing clues."}
                </div>

                {isEditing ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <input
                      value={editForm.label}
                      onChange={(event) =>
                        setEditForm((current) =>
                          current ? { ...current, label: event.target.value } : current
                        )
                      }
                      style={inputStyles.input}
                      placeholder="Label"
                    />
                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                      <select
                        value={editForm.category}
                        onChange={(event) =>
                          setEditForm((current) =>
                            current
                              ? {
                                  ...current,
                                  category: event.target.value as TrackedAnchorItem["category"]
                                }
                              : current
                          )
                        }
                        style={inputStyles.input}
                      >
                        <option value="SUBSCRIPTION">Subscription</option>
                        <option value="BILL">Bill</option>
                        <option value="INSURANCE">Insurance</option>
                        <option value="MEMBERSHIP">Membership</option>
                        <option value="LOAN">Loan</option>
                        <option value="TAX">Tax</option>
                        <option value="OTHER">Something else</option>
                      </select>
                      <select
                        value={editForm.cadence}
                        onChange={(event) =>
                          setEditForm((current) =>
                            current
                              ? { ...current, cadence: event.target.value as EditCadence }
                              : current
                          )
                        }
                        style={inputStyles.input}
                      >
                        <option value="MONTHLY">Monthly</option>
                        <option value="YEARLY">Yearly</option>
                        <option value="ONE_TIME">One time</option>
                        <option value="NOT_SURE">Not sure</option>
                      </select>
                    </div>
                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr" }}>
                      <input
                        type="date"
                        value={editForm.nextExpectedDate}
                        onChange={(event) =>
                          setEditForm((current) =>
                            current
                              ? { ...current, nextExpectedDate: event.target.value }
                              : current
                          )
                        }
                        style={inputStyles.input}
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.expectedAmount}
                        onChange={(event) =>
                          setEditForm((current) =>
                            current
                              ? { ...current, expectedAmount: event.target.value }
                              : current
                          )
                        }
                        placeholder="Amount"
                        style={inputStyles.input}
                      />
                      <input
                        value={editForm.currencyCode}
                        onChange={(event) =>
                          setEditForm((current) =>
                            current
                              ? { ...current, currencyCode: event.target.value }
                              : current
                          )
                        }
                        placeholder="USD"
                        style={inputStyles.input}
                      />
                    </div>
                    <textarea
                      value={editForm.notes}
                      onChange={(event) =>
                        setEditForm((current) =>
                          current ? { ...current, notes: event.target.value } : current
                        )
                      }
                      style={{ ...inputStyles.textarea, minHeight: 80 }}
                      placeholder="Optional notes"
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        style={buttonStyles.primary}
                        disabled={isSaving || editForm.label.trim().length === 0}
                        onClick={() => void saveEdit(item)}
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        style={buttonStyles.secondary}
                        onClick={() => {
                          setEditingId(null);
                          setEditForm(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={buttonStyles.secondary}
                      onClick={() => startEditing(item)}
                    >
                      Edit
                    </button>
                    {item.availableActions.includes("PAUSE") ? (
                      <button
                        type="button"
                        style={buttonStyles.secondary}
                        disabled={isSaving}
                        onClick={() =>
                          void runAction(
                            item.id,
                            () => pauseTrackedAnchor(item.id),
                            "Paused for now"
                          )
                        }
                      >
                        Pause
                      </button>
                    ) : null}
                    {item.availableActions.includes("SNOOZE") ? (
                      <button
                        type="button"
                        style={buttonStyles.secondary}
                        disabled={isSaving}
                        onClick={() =>
                          void runAction(
                            item.id,
                            () =>
                              snoozeTrackedAnchor(
                                item.id,
                                new Date(
                                  Date.now() + 7 * 24 * 60 * 60 * 1000
                                ).toISOString()
                              ),
                            "We'll bring this back next week"
                          )
                        }
                      >
                        Snooze 7 days
                      </button>
                    ) : null}
                    {item.availableActions.includes("CANCEL") ? (
                      <button
                        type="button"
                        style={buttonStyles.secondary}
                        disabled={isSaving}
                        onClick={() =>
                          void runAction(
                            item.id,
                            () => cancelTrackedAnchor(item.id),
                            "Stopped watching this"
                          )
                        }
                      >
                        Cancel
                      </button>
                    ) : null}
                    {item.availableActions.includes("ARCHIVE") ? (
                      <button
                        type="button"
                        style={buttonStyles.secondary}
                        disabled={isSaving}
                        onClick={() =>
                          void runAction(
                            item.id,
                            () => archiveTrackedAnchor(item.id),
                            "Archived"
                          )
                        }
                      >
                        Archive
                      </button>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function cadenceFromItem(item: TrackedAnchorItem): EditCadence {
  if (item.recurrenceType === "ONE_TIME") return "ONE_TIME";
  if (item.recurrenceType !== "RECURRING") return "NOT_SURE";
  if (item.recurrenceUnit === "YEAR") return "YEARLY";
  if (item.recurrenceUnit === "MONTH") return "MONTHLY";
  return "NOT_SURE";
}

function mapCadenceToRecurrence(cadence: EditCadence) {
  if (cadence === "MONTHLY") {
    return {
      recurrenceType: "RECURRING" as const,
      recurrenceInterval: 1,
      recurrenceUnit: "MONTH" as const
    };
  }
  if (cadence === "YEARLY") {
    return {
      recurrenceType: "RECURRING" as const,
      recurrenceInterval: 1,
      recurrenceUnit: "YEAR" as const
    };
  }
  if (cadence === "ONE_TIME") {
    return {
      recurrenceType: "ONE_TIME" as const,
      recurrenceInterval: null,
      recurrenceUnit: null
    };
  }
  return {
    recurrenceType: "UNKNOWN" as const,
    recurrenceInterval: null,
    recurrenceUnit: null
  };
}

function statusPill(status: TrackedAnchorItem["status"]): React.CSSProperties {
  if (status === "ACTIVE") {
    return {
      ...pillBaseStyle,
      background: "#ecfdf5",
      border: "1px solid #bbf7d0",
      color: "#166534"
    };
  }

  if (status === "PAUSED") {
    return {
      ...pillBaseStyle,
      background: "#f8fafc",
      border: "1px solid #cbd5e1",
      color: "#334155"
    };
  }

  if (status === "CANCELLED") {
    return {
      ...pillBaseStyle,
      background: "#fff7ed",
      border: "1px solid #fed7aa",
      color: "#9a3412"
    };
  }

  return {
    ...pillBaseStyle,
    background: "#f3f4f6",
    border: "1px solid #d1d5db",
    color: "#4b5563"
  };
}

const pillBaseStyle: React.CSSProperties = {
  borderRadius: radius.pill,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 700
};

const countPillStyle: React.CSSProperties = {
  borderRadius: radius.pill,
  border: `1px solid ${colors.border}`,
  background: "#f8fafc",
  color: colors.textMuted,
  fontSize: 12,
  padding: "6px 10px"
};
