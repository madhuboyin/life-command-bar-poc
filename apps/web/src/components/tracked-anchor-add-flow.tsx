"use client";

import { useMemo, useState } from "react";
import type React from "react";
import { createTrackedAnchor } from "../lib/api";
import type { TrackedAnchorCreateSuccess, TrackedAnchorItem } from "../lib/types";
import {
  buttonStyles,
  colors,
  inputStyles,
  radius,
  shadow
} from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";
import { useToast } from "./ui/toast-provider";

type Props = {
  triggerLabel?: string;
  triggerStyle?: "primary" | "secondary" | "link";
  headline?: string;
  onCreated?: (item: TrackedAnchorItem) => void;
};

type FlowStep = 1 | 2 | 3 | 4;
type CategoryChoice =
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

export default function TrackedAnchorAddFlow({
  triggerLabel = "Add something to watch",
  triggerStyle = "primary",
  headline = "What should we keep an eye on?",
  onCreated
}: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<FlowStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    item: TrackedAnchorItem;
    success: TrackedAnchorCreateSuccess;
    duplicateHint: { message: string; similarItemLabel: string } | null;
  } | null>(null);
  const [form, setForm] = useState({
    label: "",
    category: "OTHER" as CategoryChoice,
    cadence: "NOT_SURE" as CadenceChoice,
    timing: "NOT_SURE" as TimingChoice,
    specificDate: ""
  });
  const isMobile = useIsMobile();
  const { showToast } = useToast();

  const canContinue = useMemo(() => {
    if (step === 1) {
      return form.label.trim().length > 0;
    }
    if (step === 4 && form.timing === "SPECIFIC_DATE") {
      return Boolean(form.specificDate);
    }
    return true;
  }, [form.label, form.specificDate, form.timing, step]);

  function resetFlow() {
    setStep(1);
    setSubmitting(false);
    setError(null);
    setCreated(null);
    setForm({
      label: "",
      category: "OTHER",
      cadence: "NOT_SURE",
      timing: "NOT_SURE",
      specificDate: ""
    });
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
    setStep((current) => (Math.min(4, current + 1) as FlowStep));
  }

  function retreat() {
    if (step === 1) return;
    setStep((current) => (Math.max(1, current - 1) as FlowStep));
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
        category: form.category,
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
        title: "We'll keep an eye on this",
        description: response.item.label
      });
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Could not start watching this yet.";
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
                <div style={{ fontSize: 12, color: colors.textMuted }}>
                  You&apos;re covered
                </div>
                <h2 style={{ margin: 0, fontSize: isMobile ? 24 : 28 }}>
                  {created.success.title}
                </h2>
                <p style={{ margin: 0, color: colors.textMuted }}>
                  {created.success.description}
                </p>
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
                    View what we&apos;re watching
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: colors.textMuted }}>
                      Step {step} of 4
                    </div>
                    <h2 style={{ margin: "6px 0 0 0", fontSize: isMobile ? 23 : 27 }}>
                      {step === 1
                        ? headline
                        : step === 2
                          ? "What kind of thing is it?"
                          : step === 3
                            ? "About how often does it come up?"
                            : "When does it usually come up?"}
                    </h2>
                  </div>
                  <button type="button" onClick={closeFlow} style={buttonStyles.secondary}>
                    Close
                  </button>
                </div>

                {step === 1 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <input
                      value={form.label}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, label: event.target.value }))
                      }
                      placeholder="Netflix, electricity bill, car insurance..."
                      style={inputStyles.input}
                      autoFocus
                    />
                    <div style={{ fontSize: 13, color: colors.textMuted }}>
                      Keep it simple. We can fill in details later.
                    </div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <ChoiceRow<CategoryChoice>
                    value={form.category}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, category: value }))
                    }
                    options={[
                      { value: "SUBSCRIPTION", label: "Subscription" },
                      { value: "BILL", label: "Bill" },
                      { value: "INSURANCE", label: "Insurance" },
                      { value: "MEMBERSHIP", label: "Membership" },
                      { value: "OTHER", label: "Something else" }
                    ]}
                  />
                ) : null}

                {step === 3 ? (
                  <ChoiceRow<CadenceChoice>
                    value={form.cadence}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, cadence: value }))
                    }
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
                      onChange={(value) =>
                        setForm((current) => ({ ...current, timing: value }))
                      }
                      options={[
                        { value: "THIS_WEEK", label: "This week" },
                        { value: "NEXT_WEEK", label: "Next week" },
                        { value: "END_OF_MONTH", label: "End of month" },
                        { value: "SPECIFIC_DATE", label: "Around a date" },
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
                      border: `1px solid #fecaca`,
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
                      {submitting ? "Saving..." : "Start watching this"}
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
