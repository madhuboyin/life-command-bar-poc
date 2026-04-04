import ZeroInputSettingsPanel from "../../components/zero-input-settings-panel";
import { getZeroInputDecisions, getZeroInputPolicy } from "../../lib/api";
import type { ZeroInputDecisionItem, ZeroInputPolicy } from "../../lib/types";

const EMPTY_POLICY: ZeroInputPolicy = {
  id: "policy_unavailable",
  userId: "unknown",
  modeEnabled: false,
  autonomyTier: "OBSERVE_ONLY",
  allowRecurringPromotion: true,
  allowReminderAutocreate: true,
  allowDuplicateSuppression: true,
  allowAutoFlowPreparation: true,
  allowPredictionPromotion: true,
  requireApprovalForFinancialItems: true,
  requireApprovalForLowConfidence: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export default async function SettingsPage() {
  let policy: ZeroInputPolicy = EMPTY_POLICY;
  let decisions: ZeroInputDecisionItem[] = [];
  let error: string | null = null;

  try {
    const [policyResult, decisionResult] = await Promise.all([
      getZeroInputPolicy(),
      getZeroInputDecisions({
        limit: 12,
        decision: ["EXECUTED", "SUPPRESSED", "REVIEW", "APPROVAL_REQUIRED"]
      })
    ]);
    policy = policyResult.policy;
    decisions = decisionResult.items;
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load zero-input settings right now.";
  }

  return (
    <ZeroInputSettingsPanel
      initialPolicy={policy}
      initialDecisions={decisions}
      initialError={error}
    />
  );
}
