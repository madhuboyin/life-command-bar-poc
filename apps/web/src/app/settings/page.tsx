import { redirect } from "next/navigation";
import { auth } from "../../auth";
import AccountSettingsPanel from "../../components/account-settings-panel";
import TrackedAnchorManagerPanel from "../../components/tracked-anchor-manager-panel";
import ZeroInputSettingsPanel from "../../components/zero-input-settings-panel";
import {
  getGmailConnectionStatus,
  getHouseholds,
  getTrackedAnchors,
  getZeroInputDecisions,
  getZeroInputPolicy
} from "../../lib/api";
import type {
  GmailConnectionStatus,
  HouseholdSummary,
  TrackedAnchorItem,
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
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/signin?callbackUrl=/settings");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const oauthState = firstSearchParam(resolvedSearchParams.gmail);
  const oauthError = firstSearchParam(resolvedSearchParams.gmail_error);
  const oauthErrorDetails = firstSearchParam(resolvedSearchParams.gmail_error_details);

  let policy: ZeroInputPolicy = EMPTY_POLICY;
  let decisions: ZeroInputDecisionItem[] = [];
  let gmailConnection: GmailConnectionStatus | null = null;
  let households: HouseholdSummary[] = [];
  let trackedItems: TrackedAnchorItem[] = [];
  let error: string | null = null;

  try {
    const [policyResult, decisionResult, gmailResult, householdResult, trackedAnchorResult] = await Promise.all([
      getZeroInputPolicy(),
      getZeroInputDecisions({
        limit: 12,
        decision: ["EXECUTED", "SUPPRESSED", "REVIEW", "APPROVAL_REQUIRED"]
      }),
      getGmailConnectionStatus().catch(() => ({ connection: null })),
      getHouseholds().catch(() => ({ households: [] })),
      getTrackedAnchors({ status: "ALL" }).catch(() => ({ items: [], statusFilter: "ALL" as const }))
    ]);
    policy = policyResult.policy;
    decisions = decisionResult.items;
    gmailConnection = gmailResult.connection;
    households = householdResult.households;
    trackedItems = trackedAnchorResult.items;
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load zero-input settings right now.";
  }

  return (
    <>
      <main style={{ maxWidth: 980, margin: "32px auto 0 auto", padding: 24 }}>
        <AccountSettingsPanel
          user={{
            id: session.user.id,
            email: session.user.email,
            name: session.user.name ?? null,
            image: session.user.image ?? null
          }}
          gmailConnection={gmailConnection}
          households={households}
        />
        <TrackedAnchorManagerPanel initialItems={trackedItems} />
      </main>
      <ZeroInputSettingsPanel
        initialPolicy={policy}
        initialDecisions={decisions}
        initialGmailConnection={gmailConnection}
        oauthState={oauthState}
        oauthError={oauthError}
        oauthErrorDetails={oauthErrorDetails}
        initialError={error}
      />
    </>
  );
}

function firstSearchParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}
