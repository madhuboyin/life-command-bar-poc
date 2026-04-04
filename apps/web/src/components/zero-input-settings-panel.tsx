"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  getZeroInputDecisions,
  undoZeroInputDecision,
  updateZeroInputPolicy
} from "../lib/api";
import type { ZeroInputDecisionItem, ZeroInputPolicy } from "../lib/types";
import { buttonStyles, cardStyles, colors, pageStyles, radius } from "../lib/ui";
import PageHeader from "./ui/page-header";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";

type Props = {
  initialPolicy: ZeroInputPolicy;
  initialDecisions: ZeroInputDecisionItem[];
  initialError?: string | null;
};

export default function ZeroInputSettingsPanel({
  initialPolicy,
  initialDecisions,
  initialError = null
}: Props) {
  const [policy, setPolicy] = useState<ZeroInputPolicy>(initialPolicy);
  const [decisions, setDecisions] = useState<ZeroInputDecisionItem[]>(initialDecisions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const { showToast } = useToast();

  async function save() {
    try {
      setLoading(true);
      setError(null);
      const updated = await updateZeroInputPolicy({
        modeEnabled: policy.modeEnabled,
        autonomyTier: policy.autonomyTier,
        allowRecurringPromotion: policy.allowRecurringPromotion,
        allowReminderAutocreate: policy.allowReminderAutocreate,
        allowDuplicateSuppression: policy.allowDuplicateSuppression,
        allowAutoFlowPreparation: policy.allowAutoFlowPreparation,
        allowPredictionPromotion: policy.allowPredictionPromotion,
        requireApprovalForFinancialItems: policy.requireApprovalForFinancialItems,
        requireApprovalForLowConfidence: policy.requireApprovalForLowConfidence,
        quietHoursStart: policy.quietHoursStart,
        quietHoursEnd: policy.quietHoursEnd
      });
      setPolicy(updated.policy);
      showToast({
        variant: "success",
        title: "Zero-Input settings saved",
        description: "Autonomy policy updated."
      });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save settings";
      setError(message);
      showToast({ variant: "error", title: "Save failed", description: message });
    } finally {
      setLoading(false);
    }
  }

  async function refreshDecisions() {
    try {
      const data = await getZeroInputDecisions({
        limit: 12,
        decision: ["EXECUTED", "SUPPRESSED", "REVIEW", "APPROVAL_REQUIRED"]
      });
      setDecisions(data.items);
    } catch {
      // keep stale list quietly
    }
  }

  async function undo(decisionId: string) {
    try {
      setLoading(true);
      await undoZeroInputDecision(decisionId, "undone_from_settings");
      await refreshDecisions();
      showToast({
        variant: "success",
        title: "Action undone",
        description: "The autonomous action was reverted."
      });
    } catch (undoError) {
      const message = undoError instanceof Error ? undoError.message : "Could not undo action";
      showToast({ variant: "error", title: "Undo failed", description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to dashboard
        </Link>
      </div>

      <PageHeader
        title="Zero-Input Mode"
        description="Configure safe autonomy so routine life-admin gets handled quietly with clear guardrails."
        actions={
          <button type="button" onClick={() => void save()} disabled={loading} style={buttonStyles.primary}>
            {loading ? "Saving..." : "Save settings"}
          </button>
        }
      />

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      <section style={{ ...cardStyles.bordered, display: "grid", gap: 14, marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={policy.modeEnabled}
            onChange={(event) =>
              setPolicy((current) => ({ ...current, modeEnabled: event.target.checked }))
            }
          />
          Enable Zero-Input Mode
        </label>

        <div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8 }}>Autonomy tier</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { key: "OBSERVE_ONLY", label: "Observe only" },
              { key: "PREPARE_ONLY", label: "Prepare only" },
              { key: "SAFE_AUTOMATION", label: "Safe automation" }
            ].map((tier) => (
              <button
                key={tier.key}
                type="button"
                onClick={() =>
                  setPolicy((current) => ({
                    ...current,
                    autonomyTier: tier.key as ZeroInputPolicy["autonomyTier"]
                  }))
                }
                style={{
                  ...buttonStyles.secondary,
                  background:
                    policy.autonomyTier === tier.key ? colors.neutralBadgeBg : buttonStyles.secondary.background,
                  borderColor:
                    policy.autonomyTier === tier.key ? colors.neutralBadgeText : buttonStyles.secondary.border
                }}
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <Toggle
            label="Allow recurring prediction promotion"
            checked={policy.allowRecurringPromotion}
            onChange={(value) => setPolicy((current) => ({ ...current, allowRecurringPromotion: value }))}
          />
          <Toggle
            label="Allow reminder auto-create"
            checked={policy.allowReminderAutocreate}
            onChange={(value) => setPolicy((current) => ({ ...current, allowReminderAutocreate: value }))}
          />
          <Toggle
            label="Allow duplicate suppression"
            checked={policy.allowDuplicateSuppression}
            onChange={(value) => setPolicy((current) => ({ ...current, allowDuplicateSuppression: value }))}
          />
          <Toggle
            label="Allow auto-flow preparation"
            checked={policy.allowAutoFlowPreparation}
            onChange={(value) => setPolicy((current) => ({ ...current, allowAutoFlowPreparation: value }))}
          />
          <Toggle
            label="Allow prediction promotion"
            checked={policy.allowPredictionPromotion}
            onChange={(value) => setPolicy((current) => ({ ...current, allowPredictionPromotion: value }))}
          />
          <Toggle
            label="Financial items require approval"
            checked={policy.requireApprovalForFinancialItems}
            onChange={(value) =>
              setPolicy((current) => ({ ...current, requireApprovalForFinancialItems: value }))
            }
          />
          <Toggle
            label="Low-confidence items require approval"
            checked={policy.requireApprovalForLowConfidence}
            onChange={(value) =>
              setPolicy((current) => ({ ...current, requireApprovalForLowConfidence: value }))
            }
          />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 6, minWidth: 180 }}>
            <span style={{ fontSize: 13, color: colors.textMuted }}>Quiet hours start (HH:mm)</span>
            <input
              value={policy.quietHoursStart ?? ""}
              placeholder="22:00"
              onChange={(event) =>
                setPolicy((current) => ({
                  ...current,
                  quietHoursStart: event.target.value.trim() || null
                }))
              }
              style={inputStyles}
            />
          </label>
          <label style={{ display: "grid", gap: 6, minWidth: 180 }}>
            <span style={{ fontSize: 13, color: colors.textMuted }}>Quiet hours end (HH:mm)</span>
            <input
              value={policy.quietHoursEnd ?? ""}
              placeholder="07:00"
              onChange={(event) =>
                setPolicy((current) => ({
                  ...current,
                  quietHoursEnd: event.target.value.trim() || null
                }))
              }
              style={inputStyles}
            />
          </label>
        </div>
      </section>

      <section style={{ ...cardStyles.bordered, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Recent autonomous decisions</h2>
          <button type="button" onClick={() => void refreshDecisions()} style={buttonStyles.secondary}>
            Refresh
          </button>
        </div>

        {decisions.length === 0 ? (
          <div style={{ color: colors.textMuted }}>No autonomous decisions yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {decisions.map((item) => (
              <article
                key={item.id}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.lg,
                  padding: 12,
                  display: "grid",
                  gap: 8
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>
                    {item.decision} · {item.approvalStatus}
                  </div>
                </div>
                {item.description ? <div style={{ color: colors.textMuted }}>{item.description}</div> : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Tag label={item.candidateAction.replace(/_/g, " ").toLowerCase()} />
                  <Tag label={`confidence ${item.confidenceBand.toLowerCase()}`} />
                  <Tag label={new Date(item.createdAt).toLocaleString()} />
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {item.canUndo ? (
                    <button
                      type="button"
                      onClick={() => void undo(item.id)}
                      disabled={loading}
                      style={buttonStyles.secondary}
                    >
                      Undo
                    </button>
                  ) : null}
                  {item.obligationId ? (
                    <Link href={`/obligations/${item.obligationId}`} style={buttonStyles.link}>
                      View obligation
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span
      style={{
        borderRadius: radius.pill,
        border: `1px solid ${colors.border}`,
        padding: "4px 10px",
        fontSize: 12,
        color: colors.textMuted,
        background: colors.surface
      }}
    >
      {label}
    </span>
  );
}

const inputStyles: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  height: 36,
  padding: "0 10px",
  fontSize: 14
};
