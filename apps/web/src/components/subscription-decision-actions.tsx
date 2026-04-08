"use client";

import { buildActionLabel } from "../lib/human-language.service";
import {
  buildPrimaryReassurance,
  buildReminderDeferralMessage
} from "../lib/emotional-trust.service";
import { buttonStyles, colors, inputStyles } from "../lib/ui";

type Props = {
  loadingAction: "KEEP" | "CANCEL" | "REMIND_LATER" | "DETAILS" | null;
  remindAt: string;
  setRemindAt: (value: string) => void;
  detailsOpen: boolean;
  onKeep: () => void;
  onCancel: () => void;
  onRemind: () => void;
  onToggleDetails: () => void;
};

export default function SubscriptionDecisionActions({
  loadingAction,
  remindAt,
  setRemindAt,
  detailsOpen,
  onKeep,
  onCancel,
  onRemind,
  onToggleDetails
}: Props) {
  const decisionMessage = buildPrimaryReassurance({ emotionalState: "DECISION_NOW" });
  const reminderMessage = buildReminderDeferralMessage({ phase: "before" });

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 13, color: colors.textMuted }}>{decisionMessage.supporting}</div>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, max-content))" }}>
        <button type="button" onClick={onKeep} style={buttonStyles.primary} disabled={loadingAction !== null}>
          {loadingAction === "KEEP" ? "Saving..." : buildActionLabel("keep")}
        </button>
        <button type="button" onClick={onCancel} style={buttonStyles.danger} disabled={loadingAction !== null}>
          {loadingAction === "CANCEL" ? "Saving..." : buildActionLabel("cancel")}
        </button>
        <button
          type="button"
          onClick={onToggleDetails}
          style={buttonStyles.secondary}
          disabled={loadingAction !== null}
        >
          {loadingAction === "DETAILS"
            ? "Loading..."
            : detailsOpen
              ? "Hide details"
              : "Take a closer look"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 8, maxWidth: 320 }}>
        <label style={{ fontSize: 12, color: colors.textMuted }}>{reminderMessage.primary}</label>
        <div style={{ fontSize: 12, color: colors.textMuted }}>{reminderMessage.supporting}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="date"
            value={remindAt}
            onChange={(event) => setRemindAt(event.target.value)}
            style={inputStyles.input}
          />
          <button
            type="button"
            onClick={onRemind}
            style={buttonStyles.secondary}
            disabled={loadingAction !== null}
          >
            {loadingAction === "REMIND_LATER" ? "Saving..." : buildActionLabel("remind")}
          </button>
        </div>
      </div>
    </section>
  );
}
