import ZeroInputSettingsPanel from "../../components/zero-input-settings-panel";
import {
  getGmailConnectionStatus,
  getZeroInputDecisions,
  getZeroInputPolicy
} from "../../lib/api";
import type {
  GmailConnectionStatus,
  ZeroInputDecisionItem,
  ZeroInputPolicy
} from "../../lib/types";

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

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined> | undefined>;
};

export default async function SettingsPage({ searchParams }: Props) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const oauthState = firstSearchParam(resolvedSearchParams.gmail);
  const oauthError = firstSearchParam(resolvedSearchParams.gmail_error);
  const oauthErrorDetails = firstSearchParam(resolvedSearchParams.gmail_error_details);

  let policy: ZeroInputPolicy = EMPTY_POLICY;
  let decisions: ZeroInputDecisionItem[] = [];
  let gmailConnection: GmailConnectionStatus | null = null;
  let error: string | null = null;

  try {
    const [policyResult, decisionResult, gmailResult] = await Promise.all([
      getZeroInputPolicy(),
      getZeroInputDecisions({
        limit: 12,
        decision: ["EXECUTED", "SUPPRESSED", "REVIEW", "APPROVAL_REQUIRED"]
      }),
      getGmailConnectionStatus().catch(() => ({ connection: null }))
    ]);
    policy = policyResult.policy;
    decisions = decisionResult.items;
    gmailConnection = gmailResult.connection;
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
      initialGmailConnection={gmailConnection}
      oauthState={oauthState}
      oauthError={oauthError}
      oauthErrorDetails={oauthErrorDetails}
      initialError={error}
    />
  );
}

function firstSearchParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}
