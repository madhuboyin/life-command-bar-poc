"use client";

import React, { useMemo, useState } from "react";
import { createTrackedAnchor } from "../lib/api";
import type { TrackedAnchorCreateSuccess, TrackedAnchorItem } from "../lib/types";
import { buttonStyles, colors, inputStyles, radius, shadow } from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";
import { useToast } from "./ui/toast-provider";

type Props = {
  triggerLabel?: string;
  triggerStyle?: "primary" | "secondary" | "link";
  headline?: string;
  onCreated?: (item: TrackedAnchorItem) => void;
  defaultOpen?: boolean;
};

type FlowStep = 1 | 2 | 3 | 4;
export type CategoryChoice =
  | "SUBSCRIPTION"
  | "BILL"
  | "RECURRING_PAYMENT"
  | "INSURANCE"
  | "OTHER";

type PersistedCategoryChoice =
  | "SUBSCRIPTION"
  | "BILL"
  | "INSURANCE"
  | "MEMBERSHIP"
  | "OTHER";

type CadenceChoice = "MONTHLY" | "YEARLY" | "ONE_TIME" | "NOT_SURE";
type TimingChoice =
  | "THIS_WEEK"
  | "NEXT_WEEK"
  | "END_OF_MONTH"
  | "SPECIFIC_DATE"
  | "NOT_SURE";

type CategoryOption = {
  value: CategoryChoice;
  label: string;
  supporting: string;
  stepTwoTitle: string;
  stepTwoPlaceholder: string;
  suggestions: string[];
};

export type TrackedAnchorFormState = {
  label: string;
  category: CategoryChoice | null;
  cadence: CadenceChoice;
  timing: TimingChoice;
  specificDate: string;
};

export const TRACKED_ANCHOR_FIRST_STEP_TITLE =
  "What do you want help staying on top of?";
export const TRACKED_ANCHOR_SECONDARY_INPUT_COPY =
  "Or type anything - we'll figure it out.";
export const TRACKED_ANCHOR_HELPER_COPY =
  "Just start with one - we'll handle the rest later.";

const STEP_TWO_FALLBACK_TITLE = "What should we call it?";
const STEP_TWO_FALLBACK_PLACEHOLDER =
  "Netflix, electricity bill, car insurance...";

export const TRACKED_ANCHOR_CATEGORY_OPTIONS: CategoryOption[] = [
  {
    value: "SUBSCRIPTION",
    label: "Subscriptions",
    supporting: "Netflix, Spotify, Prime",
    stepTwoTitle: "Which subscription?",
    stepTwoPlaceholder: "Netflix, Spotify, Amazon Prime...",
    suggestions: ["Netflix", "Spotify", "Amazon Prime", "YouTube Premium"]
  },
  {
    value: "BILL",
    label: "Bills",
    supporting: "Electricity, internet, phone",
    stepTwoTitle: "Which bill?",
    stepTwoPlaceholder: "Electricity bill, internet bill...",
    suggestions: ["Electricity bill", "Internet bill", "Phone bill", "Water bill"]
  },
  {
    value: "RECURRING_PAYMENT",
    label: "Recurring payments",
    supporting: "Gym, HOA, tuition",
    stepTwoTitle: "Which payment do you want help remembering?",
    stepTwoPlaceholder: "Gym membership, HOA dues...",
    suggestions: ["Gym membership", "HOA dues", "Storage unit", "Tuition payment"]
  },
  {
    value: "INSURANCE",
    label: "Insurance",
    supporting: "Car, home, health",
    stepTwoTitle: "Which insurance?",
    stepTwoPlaceholder: "Car insurance, home insurance...",
    suggestions: [
      "Car insurance",
      "Home insurance",
      "Health insurance",
      "Renters insurance"
    ]
  },
  {
    value: "OTHER",
    label: "Something else",
    supporting: "Anything you keep forgetting",
    stepTwoTitle: "What should we remind you about?",
    stepTwoPlaceholder: "Property tax, car registration...",
    suggestions: ["Property tax", "Car registration", "School fee", "Annual renewal"]
  }
];

const DEFAULT_FORM: TrackedAnchorFormState = {
  label: "",
  category: null,
  cadence: "NOT_SURE",
  timing: "NOT_SURE",
  specificDate: ""
};

export function getTrackedAnchorStepTwoTitle(category: CategoryChoice | null) {
  return getCategoryOption(category)?.stepTwoTitle ?? STEP_TWO_FALLBACK_TITLE;
}

export function getTrackedAnchorStepTwoPlaceholder(category: CategoryChoice | null) {
  return getCategoryOption(category)?.stepTwoPlaceholder ?? STEP_TWO_FALLBACK_PLACEHOLDER;
}

export function getTrackedAnchorSuggestions(category: CategoryChoice | null) {
  return getCategoryOption(category)?.suggestions ?? [];
}

export function isTrackedAnchorStepValid(step: FlowStep, form: TrackedAnchorFormState) {
  if (step === 1) {
    return Boolean(form.category) || form.label.trim().length > 0;
  }

  if (step === 2) {
    return form.label.trim().length > 0;
  }

  if (step === 4 && form.timing === "SPECIFIC_DATE") {
    return Boolean(form.specificDate);
  }

  return true;
}

export function nextTrackedAnchorStep(step: FlowStep): FlowStep {
  return Math.min(4, step + 1) as FlowStep;
}

export function previousTrackedAnchorStep(step: FlowStep): FlowStep {
  return Math.max(1, step - 1) as FlowStep;
}

export default function TrackedAnchorAddFlow({
  triggerLabel = "Add something to watch",
  triggerStyle = "primary",
  headline = TRACKED_ANCHOR_FIRST_STEP_TITLE,
  onCreated,
  defaultOpen = false
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [step, setStep] = useState<FlowStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    item: TrackedAnchorItem;
    success: TrackedAnchorCreateSuccess;
    duplicateHint: { message: string; similarItemLabel: string } | null;
  } | null>(null);
  const [form, setForm] = useState<TrackedAnchorFormState>(DEFAULT_FORM);
  const isMobile = useIsMobile();
  const { showToast } = useToast();

  const canContinue = useMemo(() => isTrackedAnchorStepValid(step, form), [form, step]);

  function resetFlow() {
    setStep(1);
    setSubmitting(false);
    setError(null);
    setCreated(null);
    setForm(DEFAULT_FORM);
  }

  function closeFlow() {
    setOpen(false);
    resetFlow();
  }

  function openFlow() {
    setOpen(true);
  }

  function advance() {
    if (!canContinue || step === 4) return;
    setStep((current) => nextTrackedAnchorStep(current));
  }

  function retreat() {
    if (step === 1) return;
    setStep((current) => previousTrackedAnchorStep(current));
  }

  async function submit() {
    try {
      setSubmitting(true);
      setError(null);

      const recurrence = mapCadenceToRecurrence(form.cadence);
      const timingDate =
        form.timing === "SPECIFIC_DATE" && form.specificDate
          ? `${form.specificDate}T12:00:00.000Z`
          : null;

      const response = await createTrackedAnchor({
        label: form.label.trim(),
        category: mapCategoryToPersistedCategory(form.category),
        recurrenceType: recurrence.recurrenceType,
        recurrenceInterval: recurrence.recurrenceInterval,
        recurrenceUnit: recurrence.recurrenceUnit,
        timingHint: form.timing,
        timingDate
      });

      setCreated(response);
      onCreated?.(response.item);
      showToast({
        variant: "success",
        title: "We'll help you stay on top of this",
        description: response.item.label
      });
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Could not save this yet.";
      setError(message);
      showToast({
        variant: "error",
        title: "Couldn't save this yet",
        description: message
      });
    } finally {
      setSubmitting(false);
    }
  }

  const stepHeadline =
    step === 1
      ? headline
      : step === 2
        ? getTrackedAnchorStepTwoTitle(form.category)
        : step === 3
          ? "About how often does it come up?"
          : "When does it usually come up?";

  const stepTwoSuggestions = getTrackedAnchorSuggestions(form.category);

  return (
    <>
      <button type="button" onClick={openFlow} style={buttonStyles[triggerStyle]}>
        {triggerLabel}
      </button>

      {open ? (
        <div style={overlayStyle} onClick={closeFlow}>
          <div
            style={{
              ...modalStyle,
              maxWidth: isMobile ? "100%" : 640,
              padding: isMobile ? 16 : 22
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {created ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ fontSize: 12, color: colors.textMuted }}>You're covered</div>
                <h2 style={{ margin: 0, fontSize: isMobile ? 24 : 28 }}>{created.success.title}</h2>
                <p style={{ margin: 0, color: colors.textMuted }}>{created.success.description}</p>
                {created.success.nextTimingLine ? (
                  <div style={{ ...pillStyle, background: "#ecfeff", borderColor: "#a5f3fc" }}>
                    {created.success.nextTimingLine}
                  </div>
                ) : null}
                <div style={pillStyle}>{created.success.reassurance}</div>
                {created.duplicateHint ? (
                  <div style={{ ...pillStyle, background: "#fff7ed", borderColor: "#fed7aa" }}>
                    {created.duplicateHint.message} Similar: {created.duplicateHint.similarItemLabel}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" onClick={closeFlow} style={buttonStyles.primary}>
                    Done
                  </button>
                  <a href="/settings#watch-list" style={buttonStyles.link}>
                    View what we're watching
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: colors.textMuted }}>Step {step} of 4</div>
                    <h2 style={{ margin: "6px 0 0 0", fontSize: isMobile ? 23 : 27 }}>
                      {stepHeadline}
                    </h2>
                  </div>
                  <button type="button" onClick={closeFlow} style={quietCloseButtonStyle}>
                    Close
                  </button>
                </div>

                {step === 1 ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr"
                      }}
                    >
                      {TRACKED_ANCHOR_CATEGORY_OPTIONS.map((option) => {
                        const selected = form.category === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                category:
                                  current.category === option.value ? null : option.value
                              }))
                            }
                            style={categoryButtonStyle(selected)}
                          >
                            <span style={{ fontWeight: 700 }}>{option.label}</span>
                            <span style={{ color: colors.textMuted, fontSize: 12 }}>
                              {option.supporting}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 13, color: colors.textMuted }}>
                        {TRACKED_ANCHOR_SECONDARY_INPUT_COPY}
                      </div>
                      <input
                        value={form.label}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, label: event.target.value }))
                        }
                        placeholder={STEP_TWO_FALLBACK_PLACEHOLDER}
                        style={inputStyles.input}
                      />
                    </div>

                    <div style={{ fontSize: 13, color: colors.textMuted }}>
                      {TRACKED_ANCHOR_HELPER_COPY}
                    </div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {stepTwoSuggestions.length > 0 ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {stepTwoSuggestions.map((suggestion) => {
                          const selected = form.label.trim().toLowerCase() === suggestion.toLowerCase();
                          return (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() =>
                                setForm((current) => ({ ...current, label: suggestion }))
                              }
                              style={suggestionChipStyle(selected)}
                            >
                              {suggestion}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    <input
                      value={form.label}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, label: event.target.value }))
                      }
                      placeholder={getTrackedAnchorStepTwoPlaceholder(form.category)}
                      style={inputStyles.input}
                      autoFocus
                    />
                  </div>
                ) : null}

                {step === 3 ? (
                  <ChoiceRow<CadenceChoice>
                    value={form.cadence}
                    onChange={(value) => setForm((current) => ({ ...current, cadence: value }))}
                    options={[
                      { value: "MONTHLY", label: "Monthly" },
                      { value: "YEARLY", label: "Yearly" },
                      { value: "ONE_TIME", label: "One time" },
                      { value: "NOT_SURE", label: "Not sure" }
                    ]}
                  />
                ) : null}

                {step === 4 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <ChoiceRow<TimingChoice>
                      value={form.timing}
                      onChange={(value) => setForm((current) => ({ ...current, timing: value }))}
                      options={[
                        { value: "THIS_WEEK", label: "This week" },
                        { value: "NEXT_WEEK", label: "Next week" },
                        { value: "END_OF_MONTH", label: "End of the month" },
                        { value: "SPECIFIC_DATE", label: "Pick a date" },
                        { value: "NOT_SURE", label: "Not sure" }
                      ]}
                    />
                    {form.timing === "SPECIFIC_DATE" ? (
                      <input
                        type="date"
                        value={form.specificDate}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            specificDate: event.target.value
                          }))
                        }
                        style={inputStyles.input}
                      />
                    ) : null}
                  </div>
                ) : null}

                {error ? (
                  <div
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      borderRadius: radius.md,
                      color: "#991b1b",
                      padding: "10px 12px"
                    }}
                  >
                    {error}
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
                  <button
                    type="button"
                    onClick={retreat}
                    disabled={step === 1 || submitting}
                    style={buttonStyles.secondary}
                  >
                    Back
                  </button>

                  {step < 4 ? (
                    <button
                      type="button"
                      onClick={advance}
                      disabled={!canContinue || submitting}
                      style={buttonStyles.primary}
                    >
                      Continue
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={submit}
                      disabled={!canContinue || submitting}
                      style={buttonStyles.primary}
                    >
                      {submitting ? "Saving..." : "Set this up"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function mapCadenceToRecurrence(cadence: CadenceChoice) {
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

function getCategoryOption(category: CategoryChoice | null) {
  if (!category) return null;
  return TRACKED_ANCHOR_CATEGORY_OPTIONS.find((option) => option.value === category) ?? null;
}

function mapCategoryToPersistedCategory(
  category: CategoryChoice | null
): PersistedCategoryChoice {
  if (category === "SUBSCRIPTION") return "SUBSCRIPTION";
  if (category === "BILL") return "BILL";
  if (category === "INSURANCE") return "INSURANCE";
  if (category === "RECURRING_PAYMENT") return "MEMBERSHIP";
  return "OTHER";
}

function ChoiceRow<T extends string>({
  value,
  onChange,
  options
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              textAlign: "left",
              border: selected ? "1px solid #0f172a" : `1px solid ${colors.borderStrong}`,
              background: selected ? "#f8fafc" : "#fff",
              borderRadius: radius.md,
              padding: "11px 13px",
              fontWeight: selected ? 700 : 500,
              cursor: "pointer"
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function categoryButtonStyle(selected: boolean): React.CSSProperties {
  return {
    border: selected ? "1px solid #0f172a" : `1px solid ${colors.borderStrong}`,
    borderRadius: radius.md,
    background: selected ? "#f8fafc" : "#fff",
    color: colors.text,
    textAlign: "left",
    minHeight: 64,
    padding: "12px 14px",
    display: "grid",
    gap: 2,
    cursor: "pointer"
  };
}

function suggestionChipStyle(selected: boolean): React.CSSProperties {
  return {
    border: selected ? "1px solid #0f172a" : `1px solid ${colors.border}`,
    background: selected ? "#f8fafc" : "#fff",
    borderRadius: radius.pill,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: selected ? 600 : 500,
    cursor: "pointer"
  };
}

const quietCloseButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: colors.textMuted,
  padding: "4px 0",
  fontWeight: 600,
  cursor: "pointer"
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 14,
  zIndex: 70
};

const modalStyle: React.CSSProperties = {
  width: "100%",
  background: colors.surface,
  borderRadius: radius.xl,
  boxShadow: shadow.modal
};

const pillStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  background: "#f8fafc",
  color: colors.text,
  padding: "10px 12px"
};
