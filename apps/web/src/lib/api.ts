import type {
  AdminAlertsResponse,
  AdminMetricsOverviewResponse,
  AdminMetricSeriesResponse,
  AdminMetricTrendsResponse,
  AdminObservabilityEventsResponse,
  AutoFlowListResponse,
  CommandExecuteResponse,
  CommandParseResponse,
  ControlTowerResponse,
  DailyPulseItemUpdateResponse,
  DailyPulseProgressResponse,
  DailyPulseResponse,
  DailyPulseState,
  DailyCommandCenterActionResponse,
  DailyCommandCenterResponse,
  DashboardInsightsResponse,
  FocusSessionCreateResponse,
  FocusSessionResponse,
  FlowSession,
  FlowSourceContext,
  FlowSourceType,
  GuidedJourney,
  GmailConnectionStatus,
  GmailSyncResult,
  HouseholdControlTowerResponse,
  HouseholdInvite,
  HouseholdMember,
  HouseholdPulseResponse,
  HouseholdSummary,
  IngestionResult,
  MemoryContext,
  MemoryEntity,
  MemoryPattern,
  MemorySummary,
  Obligation,
  ObligationSourceDetails,
  ObligationHistory,
  ObligationSort,
  ObligationView,
  OutcomeSourceContext,
  OutcomeType,
  PersonalizationDebug,
  PersonalizationSummary,
  PredictionItem,
  PredictionListResponse,
  PredictionUpcomingResponse,
  ReviewQueueResponse,
  Reminder,
  TrackedAnchorCreateSuccess,
  TrackedAnchorItem,
  ResolutionResponse,
  SortDirection,
  SubscriptionLifecycleState,
  SubscriptionDecisionFlowData,
  SubscriptionOptimizationRecord,
  SubscriptionReviewActionResponse,
  SubscriptionReviewHubResponse,
  SubscriptionRegistryDetail,
  SubscriptionRegistryListResponse,
  TodayFeedResponse,
  TodayActionKey,
  ZeroInputDecisionItem,
  ZeroInputPolicy
} from "./types";
import { hardenUserFacingData } from "./user-facing-copy";

const PUBLIC_API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
const SERVER_API_BASE_URL = (process.env.API_BASE_URL || "").trim();
const SERVER_APP_URL =
  (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.SITE_URL || "").trim();
const VERCEL_URL = (process.env.VERCEL_URL || "").trim();

const CLIENT_SESSION_CACHE_MS = 15_000;
let cachedClientApiToken: {
  value: string | null;
  fetchedAt: number;
} | null = null;

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: { message?: string };
  message?: string;
};

type ObligationsListResponse = {
  items: Obligation[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  appliedView?: ObligationView | null;
};

type ObligationResponse = {
  obligation: Obligation;
};

type RemindersListResponse = {
  items: Reminder[];
};

type ReminderResponse = {
  reminder: Reminder;
};

type TrackedAnchorListResponse = {
  items: TrackedAnchorItem[];
  statusFilter: "ACTIVE" | "PAUSED" | "CANCELLED" | "ARCHIVED" | "ALL";
};

type TrackedAnchorResponse = {
  item: TrackedAnchorItem;
  message?: string;
};

type TrackedAnchorCreateResponse = {
  item: TrackedAnchorItem;
  success: TrackedAnchorCreateSuccess;
  duplicateHint:
    | {
        message: string;
        similarItemLabel: string;
      }
    | null;
};

type GuidedJourneyResponse = {
  journey: GuidedJourney;
};

type GuidedJourneyCreateResponse = {
  journey: GuidedJourney;
  resumed: boolean;
};

type GuidedJourneyMaybeResponse = {
  journey: GuidedJourney | null;
};

type FlowSessionResponse = {
  session: FlowSession;
};

type DailyPulseApiResponse = DailyPulseResponse;
type DailyPulseStateApiResponse = DailyPulseState;
type DailyPulseProgressApiResponse = DailyPulseProgressResponse;
type DailyPulseItemUpdateApiResponse = DailyPulseItemUpdateResponse;
type DailyCommandCenterApiResponse = DailyCommandCenterResponse;
type DailyCommandCenterActionApiResponse = DailyCommandCenterActionResponse;
type PersonalizationSummaryApiResponse = PersonalizationSummary;
type PersonalizationDebugApiResponse = PersonalizationDebug;
type UploadIngestionApiResponse = {
  uploadId: string;
  jobTriggered: boolean;
  extraction: {
    status: "EXTRACTED" | "PARTIAL" | "UNSUPPORTED" | "FAILED";
    note: string | null;
  };
  ingestion: IngestionResult;
};

type MemoryEntitiesResponse = {
  items: MemoryEntity[];
};

type MemoryPatternsResponse = {
  items: MemoryPattern[];
};

type PredictionByIdResponse = {
  prediction: PredictionItem;
};

type HouseholdsListResponse = {
  households: HouseholdSummary[];
};

type HouseholdResponse = {
  household: HouseholdSummary;
};

type HouseholdMembersResponse = {
  members: HouseholdMember[];
};

type HouseholdInviteResponse = {
  invite: HouseholdInvite;
};

type GmailStatusResponse = {
  connection: GmailConnectionStatus | null;
};

type GmailOAuthStartResponse = {
  authUrl: string;
};

type GmailSyncResponse = {
  sync: GmailSyncResult;
  connection: GmailConnectionStatus | null;
};

type SubscriptionByIdResponse = {
  subscription: SubscriptionRegistryDetail;
};

type SubscriptionReviewHubApiResponse = SubscriptionReviewHubResponse;
type SubscriptionReviewFlowResponse = SubscriptionDecisionFlowData;
type SubscriptionReviewActionApiResponse = SubscriptionReviewActionResponse;

type SubscriptionDecisionResponse = {
  result: {
    subscriptionId: string;
    decision: "KEEP" | "CANCEL" | "DOWNGRADE" | "REVIEW" | "REMIND_LATER";
    recommendationType: "KEEP" | "REVIEW" | "CANCEL" | "DOWNGRADE" | "CONFIRM" | "IGNORE";
    reminderId: string | null;
    createdObligationId: string | null;
  };
  subscription: SubscriptionRegistryDetail | null;
};

function isAbsoluteHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isLocalhostName(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function inferApiOriginFromHostname(hostname: string, protocol: string) {
  if (hostname.startsWith("lcb.")) {
    return `${protocol}//api-${hostname}`;
  }

  if (hostname.startsWith("www.")) {
    return `${protocol}//api.${hostname.slice(4)}`;
  }

  return "";
}

function inferBrowserApiBaseUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  const { protocol, hostname, origin } = window.location;

  if (isLocalhostName(hostname)) {
    return "http://localhost:4000/api";
  }

  const inferredOrigin = inferApiOriginFromHostname(hostname, protocol);
  if (inferredOrigin) {
    return `${inferredOrigin}/api`;
  }

  return `${origin}/api`;
}

function resolveServerOrigin() {
  if (SERVER_APP_URL) {
    if (isAbsoluteHttpUrl(SERVER_APP_URL)) {
      return stripTrailingSlash(SERVER_APP_URL);
    }
    return stripTrailingSlash(`https://${SERVER_APP_URL}`);
  }

  if (VERCEL_URL) {
    return stripTrailingSlash(`https://${VERCEL_URL}`);
  }

  return "";
}

function resolveApiBaseUrl() {
  const isServer = typeof window === "undefined";
  const hasExplicitPublicBaseUrl = Boolean(PUBLIC_API_BASE_URL);

  if (isServer && SERVER_API_BASE_URL) {
    if (isAbsoluteHttpUrl(SERVER_API_BASE_URL)) {
      return stripTrailingSlash(SERVER_API_BASE_URL);
    }

    if (SERVER_API_BASE_URL.startsWith("/")) {
      const serverOrigin = resolveServerOrigin();
      if (serverOrigin) {
        return stripTrailingSlash(new URL(SERVER_API_BASE_URL, serverOrigin).toString());
      }
    }
  }

  if (!isServer) {
    const browserOriginApiBase = stripTrailingSlash(`${window.location.origin}/api`);
    const browserHostIsLocal = isLocalhostName(window.location.hostname);

    // In non-local browser environments, never allow localhost API targets.
    // This prevents stale production bundles/env from routing refresh calls to localhost.
    if (!browserHostIsLocal) {
      if (!PUBLIC_API_BASE_URL) {
        return browserOriginApiBase;
      }

      if (PUBLIC_API_BASE_URL.startsWith("/")) {
        return stripTrailingSlash(PUBLIC_API_BASE_URL);
      }

      if (isAbsoluteHttpUrl(PUBLIC_API_BASE_URL)) {
        try {
          const configuredUrl = new URL(PUBLIC_API_BASE_URL);
          if (isLocalhostName(configuredUrl.hostname)) {
            return browserOriginApiBase;
          }
        } catch {
          return browserOriginApiBase;
        }
      }
    }
  }

  const fallbackBaseUrl = process.env.NODE_ENV === "development" ? "http://localhost:4000/api" : "";
  const rawBaseUrl = PUBLIC_API_BASE_URL || fallbackBaseUrl;

  if (rawBaseUrl && isAbsoluteHttpUrl(rawBaseUrl)) {
    // Safety guard: if a stale production client bundle points to localhost,
    // route browser traffic to an inferred public API host.
    if (!isServer) {
      try {
        const configuredUrl = new URL(rawBaseUrl);
        if (
          isLocalhostName(configuredUrl.hostname) &&
          !isLocalhostName(window.location.hostname)
        ) {
          return stripTrailingSlash(inferBrowserApiBaseUrl());
        }
      } catch {
        // Fall through to regular handling.
      }
    }

    return stripTrailingSlash(rawBaseUrl);
  }

  if (rawBaseUrl && !rawBaseUrl.startsWith("/")) {
    return stripTrailingSlash(rawBaseUrl);
  }

  if (!isServer && rawBaseUrl.startsWith("/")) {
    if (!hasExplicitPublicBaseUrl && process.env.NODE_ENV === "production") {
      return stripTrailingSlash(inferBrowserApiBaseUrl());
    }

    return stripTrailingSlash(rawBaseUrl);
  }

  if (isServer && rawBaseUrl.startsWith("/")) {
    const serverOrigin = resolveServerOrigin();
    if (serverOrigin) {
      return stripTrailingSlash(new URL(rawBaseUrl, serverOrigin).toString());
    }
  }

  if (!isServer) {
    return stripTrailingSlash(inferBrowserApiBaseUrl());
  }

  const serverOrigin = resolveServerOrigin();
  if (serverOrigin) {
    const parsed = new URL(serverOrigin);
    const inferredApiOrigin = inferApiOriginFromHostname(parsed.hostname, parsed.protocol);
    if (inferredApiOrigin) {
      return stripTrailingSlash(`${inferredApiOrigin}/api`);
    }

    return stripTrailingSlash(`${serverOrigin}/api`);
  }

  const serverFallbackPath = rawBaseUrl && rawBaseUrl.startsWith("/") ? rawBaseUrl : "/api";
  return stripTrailingSlash(`http://localhost:4000${serverFallbackPath}`);
}

async function resolveApiAccessToken() {
  if (typeof window === "undefined") {
    const { auth } = await import("../auth");
    const session = await auth();
    return session?.apiAccessToken ?? null;
  }

  if (
    cachedClientApiToken &&
    Date.now() - cachedClientApiToken.fetchedAt <= CLIENT_SESSION_CACHE_MS
  ) {
    return cachedClientApiToken.value;
  }

  const { getSession } = await import("next-auth/react");
  const session = await getSession();
  const token = session?.apiAccessToken ?? null;
  cachedClientApiToken = {
    value: token,
    fetchedAt: Date.now()
  };
  return token;
}

async function withAuthHeaders(init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = await resolveApiAccessToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return {
    ...init,
    headers
  };
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const baseUrl = resolveApiBaseUrl();
  return fetch(`${baseUrl}${path}`, await withAuthHeaders(init));
}

async function handleResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  let payload: ApiEnvelope<T> | null = null;

  if (contentType.includes("application/json")) {
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
  }

  if (!res.ok || payload?.success === false) {
    const errorMessage =
      payload?.error?.message ||
      payload?.message ||
      `Request failed with status ${res.status}`;
    throw new Error(errorMessage);
  }

  if (payload && "data" in payload) {
    return hardenUserFacingData(payload.data as T);
  }

  return hardenUserFacingData(payload as T);
}

export async function getTodayFeed(params?: {
  includeTrace?: boolean;
}): Promise<TodayFeedResponse> {
  const query = new URLSearchParams();
  if (params?.includeTrace) {
    query.set("includeTrace", "true");
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/today-feed${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<TodayFeedResponse>(res);
}

export async function getTodayView(): Promise<DailyCommandCenterApiResponse> {
  const res = await apiFetch("/today", {
    cache: "no-store"
  });
  return handleResponse<DailyCommandCenterApiResponse>(res);
}

export async function applyTodayItemAction(
  itemId: string,
  input: {
    actionKey: TodayActionKey;
    remindAt?: string | null;
    note?: string | null;
  }
) {
  const res = await apiFetch(`/today/items/${itemId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<DailyCommandCenterActionApiResponse>(res);
}

export async function getDashboardInsights(params?: {
  includeTrace?: boolean;
}): Promise<DashboardInsightsResponse> {
  const query = new URLSearchParams();
  if (params?.includeTrace) {
    query.set("includeTrace", "true");
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/dashboard/insights${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<DashboardInsightsResponse>(res);
}

export async function getControlTower(params?: {
  reviewLimit?: number;
  approvalLimit?: number;
  readyLimit?: number;
  upcomingLimitPerWindow?: number;
  recentLimit?: number;
  systemDecisionsLimit?: number;
}): Promise<ControlTowerResponse> {
  const query = new URLSearchParams();
  if (typeof params?.reviewLimit === "number") {
    query.set("reviewLimit", String(params.reviewLimit));
  }
  if (typeof params?.approvalLimit === "number") {
    query.set("approvalLimit", String(params.approvalLimit));
  }
  if (typeof params?.readyLimit === "number") {
    query.set("readyLimit", String(params.readyLimit));
  }
  if (typeof params?.upcomingLimitPerWindow === "number") {
    query.set("upcomingLimitPerWindow", String(params.upcomingLimitPerWindow));
  }
  if (typeof params?.recentLimit === "number") {
    query.set("recentLimit", String(params.recentLimit));
  }
  if (typeof params?.systemDecisionsLimit === "number") {
    query.set("systemDecisionsLimit", String(params.systemDecisionsLimit));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/control-tower${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<ControlTowerResponse>(res);
}

export async function getControlTowerReview(limit = 6) {
  const res = await apiFetch(`/control-tower/review?limit=${encodeURIComponent(String(limit))}`, {
    cache: "no-store"
  });
  return handleResponse<{ items: ControlTowerResponse["review"] }>(res);
}

export async function getControlTowerReady(limit = 6) {
  const res = await apiFetch(`/control-tower/ready?limit=${encodeURIComponent(String(limit))}`, {
    cache: "no-store"
  });
  return handleResponse<{ items: ControlTowerResponse["ready"] }>(res);
}

export async function getControlTowerApprovals(limit = 6) {
  const res = await apiFetch(
    `/control-tower/approvals?limit=${encodeURIComponent(String(limit))}`,
    {
      cache: "no-store"
    }
  );
  return handleResponse<{ items: ControlTowerResponse["approvals"] }>(res);
}

export async function getControlTowerUpcoming(limitPerWindow = 4) {
  const res = await apiFetch(
    `/control-tower/upcoming?limitPerWindow=${encodeURIComponent(String(limitPerWindow))}`,
    {
      cache: "no-store"
    }
  );
  return handleResponse<ControlTowerResponse["upcoming"]>(res);
}

export async function getControlTowerRecent(limit = 6) {
  const res = await apiFetch(`/control-tower/recent?limit=${encodeURIComponent(String(limit))}`, {
    cache: "no-store"
  });
  return handleResponse<{ items: ControlTowerResponse["recent"] }>(res);
}

export async function getControlTowerSystemDecisions(limit = 6) {
  const res = await apiFetch(
    `/control-tower/system-decisions?limit=${encodeURIComponent(String(limit))}`,
    {
      cache: "no-store"
    }
  );
  return handleResponse<{ items: ControlTowerResponse["systemDecisions"] }>(res);
}

export async function getSubscriptions(params?: {
  lifecycleState?: SubscriptionLifecycleState;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  if (params?.lifecycleState) {
    query.set("lifecycleState", params.lifecycleState);
  }
  if (typeof params?.limit === "number") {
    query.set("limit", String(params.limit));
  }
  if (typeof params?.offset === "number") {
    query.set("offset", String(params.offset));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const res = await apiFetch(`/subscriptions${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<SubscriptionRegistryListResponse>(res);
}

export async function getSubscriptionReviewHub() {
  const res = await apiFetch("/subscriptions/review", {
    cache: "no-store"
  });
  return handleResponse<SubscriptionReviewHubApiResponse>(res);
}

export async function getSubscriptionById(subscriptionId: string) {
  const res = await apiFetch(`/subscriptions/${subscriptionId}`, {
    cache: "no-store"
  });
  return handleResponse<SubscriptionByIdResponse>(res);
}

export async function updateSubscription(
  subscriptionId: string,
  input: Partial<{
    vendorName: string;
    planName: string | null;
    subscriptionTitle: string;
    scopeType: "PERSONAL" | "HOUSEHOLD";
    householdId: string | null;
    assignedToUserId: string | null;
    lifecycleState: SubscriptionLifecycleState;
    billingPeriod: "MONTHLY" | "YEARLY" | "QUARTERLY" | "WEEKLY" | "UNKNOWN";
    recurringPrice: number | null;
    introPrice: number | null;
    amountLastCharged: number | null;
    currency: string | null;
    autoRenewStatus: "ON" | "OFF" | "UNKNOWN";
    trialEndDate: string | null;
    nextRenewalDate: string | null;
    lastChargedDate: string | null;
    cancellationEffectiveDate: string | null;
    category: string | null;
  }>
) {
  const res = await apiFetch(`/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<SubscriptionByIdResponse>(res);
}

export async function mergeSubscriptions(input: {
  primarySubscriptionId: string;
  duplicateSubscriptionId: string;
}) {
  const res = await apiFetch("/subscriptions/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<SubscriptionByIdResponse>(res);
}

export async function getSubscriptionOptimization(subscriptionId: string) {
  const res = await apiFetch(`/subscriptions/${subscriptionId}/optimization`, {
    cache: "no-store"
  });
  return handleResponse<SubscriptionOptimizationRecord>(res);
}

export async function getSubscriptionReviewFlow(subscriptionId: string) {
  const res = await apiFetch(`/subscriptions/${subscriptionId}/review-flow`, {
    cache: "no-store"
  });
  return handleResponse<SubscriptionReviewFlowResponse>(res);
}

export async function applySubscriptionReviewKeep(
  subscriptionId: string,
  input?: {
    note?: string | null;
    decisionDurationMs?: number;
  }
) {
  const res = await apiFetch(`/subscriptions/${subscriptionId}/review-actions/keep`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {})
  });
  return handleResponse<SubscriptionReviewActionApiResponse>(res);
}

export async function applySubscriptionReviewCancel(
  subscriptionId: string,
  input?: {
    note?: string | null;
    handoffToGuided?: boolean;
    decisionDurationMs?: number;
  }
) {
  const res = await apiFetch(`/subscriptions/${subscriptionId}/review-actions/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {})
  });
  return handleResponse<SubscriptionReviewActionApiResponse>(res);
}

export async function applySubscriptionReviewRemind(
  subscriptionId: string,
  input?: {
    remindAt?: string | null;
    note?: string | null;
    decisionDurationMs?: number;
  }
) {
  const res = await apiFetch(`/subscriptions/${subscriptionId}/review-actions/remind`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {})
  });
  return handleResponse<SubscriptionReviewActionApiResponse>(res);
}

export async function markSubscriptionReviewed(
  subscriptionId: string,
  input?: {
    context?: "DETAILS_OPENED" | "COMPLETED";
    note?: string | null;
    decisionDurationMs?: number;
  }
) {
  const res = await apiFetch(`/subscriptions/${subscriptionId}/review-actions/reviewed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {})
  });
  return handleResponse<SubscriptionReviewActionApiResponse>(res);
}

export async function applySubscriptionDecision(
  subscriptionId: string,
  input: {
    decision: "KEEP" | "CANCEL" | "DOWNGRADE" | "REVIEW" | "REMIND_LATER";
    remindAt?: string | null;
    note?: string | null;
  }
) {
  const res = await apiFetch(`/subscriptions/${subscriptionId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<SubscriptionDecisionResponse>(res);
}

export async function getZeroInputPolicy() {
  const res = await apiFetch("/zero-input/policy", {
    cache: "no-store"
  });
  return handleResponse<{ policy: ZeroInputPolicy }>(res);
}

export async function updateZeroInputPolicy(
  input: Partial<
    Pick<
      ZeroInputPolicy,
      | "modeEnabled"
      | "autonomyTier"
      | "allowRecurringPromotion"
      | "allowReminderAutocreate"
      | "allowDuplicateSuppression"
      | "allowAutoFlowPreparation"
      | "allowPredictionPromotion"
      | "requireApprovalForFinancialItems"
      | "requireApprovalForLowConfidence"
      | "quietHoursStart"
      | "quietHoursEnd"
    >
  >
) {
  const res = await apiFetch("/zero-input/policy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<{ policy: ZeroInputPolicy }>(res);
}

export async function getGmailConnectionStatus() {
  const res = await apiFetch("/gmail/status", {
    cache: "no-store"
  });
  return handleResponse<GmailStatusResponse>(res);
}

export async function startGmailOAuth(input: {
  windowDays: 30 | 90 | 365;
  autoSyncEnabled: boolean;
  scanSubscriptions: boolean;
  scanBills: boolean;
  scanRenewals: boolean;
  includeRecurringReceipts: boolean;
}) {
  const res = await apiFetch("/gmail/oauth/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      windowDays: String(input.windowDays),
      autoSyncEnabled: input.autoSyncEnabled,
      scanSubscriptions: input.scanSubscriptions,
      scanBills: input.scanBills,
      scanRenewals: input.scanRenewals,
      includeRecurringReceipts: input.includeRecurringReceipts
    })
  });

  return handleResponse<GmailOAuthStartResponse>(res);
}

export async function updateGmailPreferences(input: {
  autoSyncEnabled?: boolean;
  scanSubscriptions?: boolean;
  scanBills?: boolean;
  scanRenewals?: boolean;
  includeRecurringReceipts?: boolean;
}) {
  const res = await apiFetch("/gmail/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<GmailStatusResponse>(res);
}

export async function syncGmail(input?: {
  mode?: "INITIAL_BACKFILL" | "MANUAL_RESYNC" | "INCREMENTAL";
  windowDays?: 30 | 90 | 365;
  scanSubscriptions?: boolean;
  scanBills?: boolean;
  scanRenewals?: boolean;
  includeRecurringReceipts?: boolean;
  maxMessages?: number;
}) {
  const res = await apiFetch("/gmail/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      windowDays:
        typeof input?.windowDays === "number" ? String(input.windowDays) : undefined
    })
  });
  return handleResponse<GmailSyncResponse>(res);
}

export async function disconnectGmail() {
  const res = await apiFetch("/gmail/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return handleResponse<{ disconnected: boolean }>(res);
}

export async function getZeroInputDecisions(params?: {
  limit?: number;
  decision?: Array<"EXECUTED" | "REVIEW" | "APPROVAL_REQUIRED" | "SUPPRESSED">;
  approvalStatus?: Array<"NONE" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "UNDONE">;
}) {
  const query = new URLSearchParams();
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  if (params?.decision?.length) query.set("decision", params.decision.join(","));
  if (params?.approvalStatus?.length) {
    query.set("approvalStatus", params.approvalStatus.join(","));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/zero-input/decisions${suffix}`, {
    cache: "no-store"
  });
  return handleResponse<{ items: ZeroInputDecisionItem[] }>(res);
}

export async function getZeroInputApprovals(limit = 20) {
  const res = await apiFetch(`/zero-input/approvals?limit=${encodeURIComponent(String(limit))}`, {
    cache: "no-store"
  });
  return handleResponse<{ items: ZeroInputDecisionItem[] }>(res);
}

export async function approveZeroInputAction(
  decisionId: string,
  input?: { note?: string; dontAutoDoSimilar?: boolean }
) {
  const res = await apiFetch(`/zero-input/approvals/${decisionId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {})
  });
  return handleResponse<{ decision: ZeroInputDecisionItem }>(res);
}

export async function rejectZeroInputAction(
  decisionId: string,
  input?: { reason?: string; dontAutoDoSimilar?: boolean }
) {
  const res = await apiFetch(`/zero-input/approvals/${decisionId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {})
  });
  return handleResponse<{ decision: ZeroInputDecisionItem }>(res);
}

export async function undoZeroInputDecision(decisionId: string, reason?: string) {
  const res = await apiFetch(`/zero-input/decisions/${decisionId}/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });
  return handleResponse<{ decision: ZeroInputDecisionItem }>(res);
}

export async function getObligations(params?: {
  status?: Obligation["status"];
  type?: Obligation["type"];
  view?: ObligationView;
  householdId?: string;
  scopeType?: "PERSONAL" | "HOUSEHOLD";
  sort?: ObligationSort;
  direction?: SortDirection;
  limit?: number;
  offset?: number;
}): Promise<ObligationsListResponse> {
  const query = new URLSearchParams();

  if (params?.status) query.set("status", params.status);
  if (params?.type) query.set("type", params.type);
  if (params?.view) query.set("view", params.view);
  if (params?.householdId) query.set("householdId", params.householdId);
  if (params?.scopeType) query.set("scopeType", params.scopeType);
  if (params?.sort) query.set("sort", params.sort);
  if (params?.direction) query.set("direction", params.direction);
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  if (typeof params?.offset === "number") query.set("offset", String(params.offset));

  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/obligations${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<ObligationsListResponse>(res);
}

export async function getHouseholds(): Promise<HouseholdsListResponse> {
  const res = await apiFetch("/households", {
    cache: "no-store"
  });
  return handleResponse<HouseholdsListResponse>(res);
}

export async function createHousehold(input: {
  name: string;
  slug?: string;
}): Promise<HouseholdResponse> {
  const res = await apiFetch("/households", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<HouseholdResponse>(res);
}

export async function getHousehold(householdId: string): Promise<HouseholdResponse> {
  const res = await apiFetch(`/households/${householdId}`, {
    cache: "no-store"
  });
  return handleResponse<HouseholdResponse>(res);
}

export async function updateHousehold(
  householdId: string,
  input: {
    name?: string;
    slug?: string | null;
  }
): Promise<HouseholdResponse> {
  const res = await apiFetch(`/households/${householdId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<HouseholdResponse>(res);
}

export async function getHouseholdMembers(
  householdId: string
): Promise<HouseholdMembersResponse> {
  const res = await apiFetch(`/households/${householdId}/members`, {
    cache: "no-store"
  });
  return handleResponse<HouseholdMembersResponse>(res);
}

export async function inviteHouseholdMember(
  householdId: string,
  input: {
    invitedEmail: string;
    role?: "OWNER" | "MEMBER";
    expiresInDays?: number;
  }
): Promise<HouseholdInviteResponse> {
  const res = await apiFetch(`/households/${householdId}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<HouseholdInviteResponse>(res);
}

export async function acceptHouseholdInvite(token: string): Promise<HouseholdResponse> {
  const res = await apiFetch(`/household-invites/${token}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return handleResponse<HouseholdResponse>(res);
}

export async function revokeHouseholdInvite(inviteId: string): Promise<HouseholdInviteResponse> {
  const res = await apiFetch(`/household-invites/${inviteId}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return handleResponse<HouseholdInviteResponse>(res);
}

export async function removeHouseholdMember(
  householdId: string,
  memberId: string
): Promise<{ member: HouseholdMember; unassignedObligationCount: number }> {
  const res = await apiFetch(`/households/${householdId}/members/${memberId}`, {
    method: "DELETE"
  });
  return handleResponse<{ member: HouseholdMember; unassignedObligationCount: number }>(res);
}

export async function getHouseholdObligations(
  householdId: string,
  params?: {
    view?: ObligationView;
    sort?: ObligationSort;
    direction?: SortDirection;
    limit?: number;
    offset?: number;
  }
): Promise<ObligationsListResponse> {
  const query = new URLSearchParams();
  if (params?.view) query.set("view", params.view);
  if (params?.sort) query.set("sort", params.sort);
  if (params?.direction) query.set("direction", params.direction);
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  if (typeof params?.offset === "number") query.set("offset", String(params.offset));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/households/${householdId}/obligations${suffix}`, {
    cache: "no-store"
  });
  return handleResponse<ObligationsListResponse>(res);
}

export async function createHouseholdObligation(
  householdId: string,
  input: {
    type: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
    title: string;
    description?: string;
    vendor?: string;
    amount?: number;
    currency?: string;
    dueDate?: string;
    recurrence?: string;
    source?: "MANUAL" | "EMAIL" | "DOCUMENT" | "INFERRED";
    confidenceScore?: number;
    urgencyScore?: number;
    importanceScore?: number;
    effortLevel?: "LOW" | "MEDIUM" | "HIGH";
    impactLevel?: "LOW" | "MEDIUM" | "HIGH";
    status?: "DRAFT" | "ACTIVE" | "POSTPONED" | "RESOLVED" | "IGNORED";
    assignedToUserId?: string;
  }
): Promise<ObligationResponse> {
  const res = await apiFetch(`/households/${householdId}/obligations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<ObligationResponse>(res);
}

export async function getHouseholdPulse(
  householdId: string
): Promise<HouseholdPulseResponse> {
  const res = await apiFetch(`/households/${householdId}/pulse`, {
    cache: "no-store"
  });
  return handleResponse<HouseholdPulseResponse>(res);
}

export async function getHouseholdControlTower(
  householdId: string
): Promise<HouseholdControlTowerResponse> {
  const res = await apiFetch(`/households/${householdId}/control-tower`, {
    cache: "no-store"
  });
  return handleResponse<HouseholdControlTowerResponse>(res);
}

export async function getHouseholdUpcoming(
  householdId: string
): Promise<{ items: HouseholdControlTowerResponse["upcoming"] }> {
  const res = await apiFetch(`/households/${householdId}/upcoming`, {
    cache: "no-store"
  });
  return handleResponse<{ items: HouseholdControlTowerResponse["upcoming"] }>(res);
}

export async function getHouseholdReady(
  householdId: string
): Promise<{ items: HouseholdControlTowerResponse["ready"] }> {
  const res = await apiFetch(`/households/${householdId}/ready`, {
    cache: "no-store"
  });
  return handleResponse<{ items: HouseholdControlTowerResponse["ready"] }>(res);
}

export async function getHouseholdRecent(
  householdId: string
): Promise<{ items: HouseholdControlTowerResponse["recent"] }> {
  const res = await apiFetch(`/households/${householdId}/recent`, {
    cache: "no-store"
  });
  return handleResponse<{ items: HouseholdControlTowerResponse["recent"] }>(res);
}

export async function getObligationById(obligationId: string): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}`, {
    cache: "no-store"
  });

  return handleResponse<ObligationResponse>(res);
}

export async function getObligationHistory(obligationId: string): Promise<ObligationHistory> {
  const res = await apiFetch(`/obligations/${obligationId}/history`, {
    cache: "no-store"
  });

  return handleResponse<ObligationHistory>(res);
}

export async function assignObligation(
  obligationId: string,
  assignedToUserId: string
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignedToUserId })
  });

  return handleResponse<ObligationResponse>(res);
}

export async function unassignObligation(obligationId: string): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/unassign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<ObligationResponse>(res);
}

export async function claimObligation(obligationId: string): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<ObligationResponse>(res);
}

export async function handOffObligation(
  obligationId: string,
  toUserId: string
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/hand-off`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toUserId })
  });

  return handleResponse<ObligationResponse>(res);
}

export async function patchObligationScope(
  obligationId: string,
  input: {
    scopeType: "PERSONAL" | "HOUSEHOLD";
    householdId?: string | null;
  }
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/scope`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<ObligationResponse>(res);
}

export async function updateObligation(
  obligationId: string,
  input: Record<string, unknown>
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<ObligationResponse>(res);
}

export async function correctObligation(
  obligationId: string,
  input: {
    correctedFields?: Record<string, unknown>;
    reason?: string;
    dismissPermanently?: boolean;
    dontShowSimilar?: boolean;
  }
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<ObligationResponse>(res);
}

export async function getReviewQueue(params?: {
  limit?: number;
}): Promise<ReviewQueueResponse> {
  const query = new URLSearchParams();
  if (typeof params?.limit === "number") {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/obligations/review-queue${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<ReviewQueueResponse>(res);
}

export async function getObligationSource(
  obligationId: string
): Promise<ObligationSourceDetails> {
  const res = await apiFetch(`/obligations/${obligationId}/source`, {
    cache: "no-store"
  });

  return handleResponse<ObligationSourceDetails>(res);
}

export async function confirmObligationCandidate(
  obligationId: string,
  input: Record<string, unknown>
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/confirm`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<ObligationResponse>(res);
}

export async function rejectObligationCandidate(
  obligationId: string,
  reason?: string
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/reject`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });

  return handleResponse<ObligationResponse>(res);
}

export async function getResolution(obligationId: string): Promise<ResolutionResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/resolution`, {
    cache: "no-store"
  });

  return handleResponse<ResolutionResponse>(res);
}

export async function getReminders(): Promise<RemindersListResponse> {
  const res = await apiFetch("/reminders", {
    cache: "no-store"
  });

  return handleResponse<RemindersListResponse>(res);
}

export async function markObligationDone(
  obligationId: string,
  note?: string
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/mark-done`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note })
  });

  return handleResponse<ObligationResponse>(res);
}

export async function dismissObligation(
  obligationId: string,
  reason?: string
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });

  return handleResponse<ObligationResponse>(res);
}

export async function postponeObligation(
  obligationId: string,
  until?: string,
  reason?: string
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/postpone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ until, reason })
  });

  return handleResponse<ObligationResponse>(res);
}

export async function createFeedback(input: {
  obligationId?: string;
  feedItemId?: string;
  type:
    | "ACCEPTED"
    | "IGNORED"
    | "MODIFIED"
    | "COMPLETED"
    | "POSTPONED"
    | "REJECTED"
    | "NOT_RELEVANT"
    | "WRONG_INFO"
    | "DONT_SHOW_AGAIN";
  note?: string;
}): Promise<unknown> {
  const res = await apiFetch("/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<unknown>(res);
}

export async function createOutcomeFeedback(input: {
  obligationId?: string;
  guidedJourneyId?: string;
  resolutionRunId?: string;
  sourceContext: OutcomeSourceContext;
  recommendationKey?: string;
  selectedActionKey: string;
  outcomeType: OutcomeType;
  note?: string;
  metadata?: Record<string, unknown>;
}): Promise<unknown> {
  const res = await apiFetch("/outcome-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<unknown>(res);
}

export async function getPersonalizationSummary(): Promise<PersonalizationSummaryApiResponse> {
  const res = await apiFetch("/personalization/summary", {
    cache: "no-store"
  });

  return handleResponse<PersonalizationSummaryApiResponse>(res);
}

export async function getPersonalizationDebug(): Promise<PersonalizationDebugApiResponse> {
  const res = await apiFetch("/personalization/debug", {
    cache: "no-store"
  });

  return handleResponse<PersonalizationDebugApiResponse>(res);
}

export async function getMemoryEntities(params?: {
  type?: "VENDOR" | "SUBSCRIPTION" | "CATEGORY" | "OBLIGATION_TEMPLATE";
  limit?: number;
}): Promise<MemoryEntitiesResponse> {
  const query = new URLSearchParams();
  if (params?.type) query.set("type", params.type);
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/memory/entities${suffix}`, {
    cache: "no-store"
  });
  return handleResponse<MemoryEntitiesResponse>(res);
}

export async function getMemoryPatterns(params?: {
  patternType?: "RECURRING_OBLIGATION" | "USER_BEHAVIOR" | "TIMING_PATTERN";
  referenceId?: string;
  includeSuppressed?: boolean;
  limit?: number;
}): Promise<MemoryPatternsResponse> {
  const query = new URLSearchParams();
  if (params?.patternType) query.set("patternType", params.patternType);
  if (params?.referenceId) query.set("referenceId", params.referenceId);
  if (params?.includeSuppressed) query.set("includeSuppressed", "true");
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/memory/patterns${suffix}`, {
    cache: "no-store"
  });
  return handleResponse<MemoryPatternsResponse>(res);
}

export async function getMemoryContext(): Promise<MemoryContext> {
  const res = await apiFetch("/memory/context", {
    cache: "no-store"
  });
  return handleResponse<MemoryContext>(res);
}

export async function getMemorySummary(): Promise<MemorySummary> {
  const res = await apiFetch("/memory/summary", {
    cache: "no-store"
  });
  return handleResponse<MemorySummary>(res);
}

export async function rebuildMemory() {
  const res = await apiFetch("/memory/rebuild", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return handleResponse<{ rebuiltAt: string; summary: Record<string, unknown> }>(res);
}

export async function updateMemoryPattern(
  patternId: string,
  input: {
    patternData?: Record<string, unknown>;
    confidence?: number;
    frequency?: number;
    isSuppressed?: boolean;
    isUserLocked?: boolean;
  }
) {
  const res = await apiFetch(`/memory/pattern/${patternId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<{ pattern: MemoryPattern }>(res);
}

export async function deleteMemoryPattern(patternId: string) {
  const res = await apiFetch(`/memory/pattern/${patternId}`, {
    method: "DELETE"
  });
  return handleResponse<{ deleted: boolean }>(res);
}

export async function getPredictions(params?: {
  status?: Array<"ACTIVE" | "CONFIRMED" | "DISMISSED" | "EXPIRED" | "PROMOTED_TO_OBLIGATION">;
  predictionType?: Array<
    | "RECURRING_NEXT_OCCURRENCE"
    | "UPCOMING_ATTENTION"
    | "WORKLOAD_WINDOW"
    | "MISSING_EXPECTED_OBLIGATION"
  >;
  limit?: number;
}): Promise<PredictionListResponse> {
  const query = new URLSearchParams();
  for (const status of params?.status ?? []) {
    query.append("status", status);
  }
  for (const predictionType of params?.predictionType ?? []) {
    query.append("predictionType", predictionType);
  }
  if (typeof params?.limit === "number") {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/predictions${suffix}`, {
    cache: "no-store"
  });
  return handleResponse<PredictionListResponse>(res);
}

export async function getUpcomingPredictions(): Promise<PredictionUpcomingResponse> {
  const res = await apiFetch("/predictions/upcoming", {
    cache: "no-store"
  });
  return handleResponse<PredictionUpcomingResponse>(res);
}

export async function getPredictionById(predictionId: string): Promise<PredictionByIdResponse> {
  const res = await apiFetch(`/predictions/${predictionId}`, {
    cache: "no-store"
  });
  return handleResponse<PredictionByIdResponse>(res);
}

export async function confirmPrediction(predictionId: string, promote?: boolean) {
  const res = await apiFetch(`/predictions/${predictionId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ promote })
  });
  return handleResponse<{ prediction: PredictionItem; promotedObligation: Obligation | null }>(res);
}

export async function dismissPrediction(predictionId: string, reason?: string) {
  const res = await apiFetch(`/predictions/${predictionId}/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });
  return handleResponse<{ prediction: PredictionItem }>(res);
}

export async function patchPrediction(
  predictionId: string,
  input: {
    title?: string;
    description?: string | null;
    predictedDate?: string | null;
    status?: "ACTIVE" | "CONFIRMED" | "DISMISSED" | "EXPIRED" | "PROMOTED_TO_OBLIGATION";
    confidenceScore?: number;
  }
) {
  const res = await apiFetch(`/predictions/${predictionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<{ prediction: PredictionItem }>(res);
}

export async function deletePrediction(predictionId: string) {
  const res = await apiFetch(`/predictions/${predictionId}`, {
    method: "DELETE"
  });
  return handleResponse<{ deleted: boolean }>(res);
}

export async function rebuildPredictions() {
  const res = await apiFetch("/predictions/rebuild", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return handleResponse<{
    rebuiltAt: string;
    count: number;
    summary: {
      recurringCount: number;
      upcomingCount: number;
      workloadCount: number;
      missingExpectedCount: number;
    };
  }>(res);
}

export async function createObligation(input: {
  scopeType?: "PERSONAL" | "HOUSEHOLD";
  householdId?: string;
  assignedToUserId?: string;
  createdByUserId?: string;
  type: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  title: string;
  description?: string;
  vendor?: string;
  amount?: number;
  currency?: string;
  dueDate?: string;
  recurrence?: string;
  source?: "MANUAL" | "EMAIL" | "DOCUMENT" | "INFERRED";
  confidenceScore?: number;
  urgencyScore?: number;
  importanceScore?: number;
  effortLevel?: "LOW" | "MEDIUM" | "HIGH";
  impactLevel?: "LOW" | "MEDIUM" | "HIGH";
  status?: "DRAFT" | "ACTIVE" | "POSTPONED" | "RESOLVED" | "IGNORED";
}): Promise<ObligationResponse> {
  const res = await apiFetch("/obligations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<ObligationResponse>(res);
}

export async function createReminder(input: {
  obligationId?: string;
  title: string;
  scheduledFor: string;
}): Promise<ReminderResponse> {
  const res = await apiFetch("/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<ReminderResponse>(res);
}

export async function getTrackedAnchors(params?: {
  status?: "ACTIVE" | "PAUSED" | "CANCELLED" | "ARCHIVED" | "ALL";
}): Promise<TrackedAnchorListResponse> {
  const query = new URLSearchParams();
  if (params?.status) {
    query.set("status", params.status);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/tracked-anchors${suffix}`, {
    cache: "no-store"
  });
  return handleResponse<TrackedAnchorListResponse>(res);
}

export async function getTrackedAnchorById(
  anchorId: string
): Promise<TrackedAnchorResponse> {
  const res = await apiFetch(`/tracked-anchors/${anchorId}`, {
    cache: "no-store"
  });
  return handleResponse<TrackedAnchorResponse>(res);
}

export async function createTrackedAnchor(input: {
  label: string;
  category?: "SUBSCRIPTION" | "BILL" | "INSURANCE" | "MEMBERSHIP" | "LOAN" | "TAX" | "OTHER";
  recurrenceType?: "RECURRING" | "ONE_TIME" | "UNKNOWN";
  recurrenceInterval?: number | null;
  recurrenceUnit?: "WEEK" | "MONTH" | "QUARTER" | "YEAR" | null;
  expectedAmount?: number | null;
  currencyCode?: string | null;
  nextExpectedDate?: string | null;
  timingHint?: "THIS_WEEK" | "NEXT_WEEK" | "END_OF_MONTH" | "SPECIFIC_DATE" | "NOT_SURE";
  timingDate?: string | null;
  reminderLeadDays?: number | null;
  notes?: string | null;
}) {
  const res = await apiFetch("/tracked-anchors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<TrackedAnchorCreateResponse>(res);
}

export async function updateTrackedAnchor(
  anchorId: string,
  input: {
    label?: string;
    category?:
      | "SUBSCRIPTION"
      | "BILL"
      | "INSURANCE"
      | "MEMBERSHIP"
      | "LOAN"
      | "TAX"
      | "OTHER";
    recurrenceType?: "RECURRING" | "ONE_TIME" | "UNKNOWN";
    recurrenceInterval?: number | null;
    recurrenceUnit?: "WEEK" | "MONTH" | "QUARTER" | "YEAR" | null;
    expectedAmount?: number | null;
    currencyCode?: string | null;
    nextExpectedDate?: string | null;
    timingHint?: "THIS_WEEK" | "NEXT_WEEK" | "END_OF_MONTH" | "SPECIFIC_DATE" | "NOT_SURE";
    timingDate?: string | null;
    reminderLeadDays?: number | null;
    notes?: string | null;
    status?: "ACTIVE" | "PAUSED" | "CANCELLED" | "ARCHIVED";
  }
): Promise<TrackedAnchorResponse> {
  const res = await apiFetch(`/tracked-anchors/${anchorId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<TrackedAnchorResponse>(res);
}

export async function pauseTrackedAnchor(anchorId: string): Promise<TrackedAnchorResponse> {
  const res = await apiFetch(`/tracked-anchors/${anchorId}/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return handleResponse<TrackedAnchorResponse>(res);
}

export async function cancelTrackedAnchor(anchorId: string): Promise<TrackedAnchorResponse> {
  const res = await apiFetch(`/tracked-anchors/${anchorId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return handleResponse<TrackedAnchorResponse>(res);
}

export async function archiveTrackedAnchor(anchorId: string): Promise<TrackedAnchorResponse> {
  const res = await apiFetch(`/tracked-anchors/${anchorId}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return handleResponse<TrackedAnchorResponse>(res);
}

export async function snoozeTrackedAnchor(
  anchorId: string,
  until: string
): Promise<TrackedAnchorResponse> {
  const res = await apiFetch(`/tracked-anchors/${anchorId}/snooze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ until })
  });
  return handleResponse<TrackedAnchorResponse>(res);
}

export async function uploadFile(file: File): Promise<UploadIngestionApiResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch("/uploads/ingest", {
    method: "POST",
    body: formData
  });

  return handleResponse<UploadIngestionApiResponse>(res);
}

export async function importEmailForward(input: {
  subject: string;
  from: string;
  bodyText: string;
}): Promise<IngestionResult> {
  const res = await apiFetch("/imports/email-forward", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<IngestionResult>(res);
}

export async function ingestCommand(input: {
  input: string;
  context?: { obligationId?: string };
}): Promise<IngestionResult> {
  const res = await apiFetch("/commands/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<IngestionResult>(res);
}

export async function parseCommand(input: {
  input: string;
  context?: { obligationId?: string };
}): Promise<CommandParseResponse> {
  const res = await apiFetch("/commands/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<CommandParseResponse>(res);
}

export async function executeCommand(input: {
  input: string;
  context?: { obligationId?: string };
}): Promise<CommandExecuteResponse> {
  const res = await apiFetch("/commands/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<CommandExecuteResponse>(res);
}

export async function createOrResumeGuidedJourney(
  obligationId: string
): Promise<GuidedJourneyCreateResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/guided-journey`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<GuidedJourneyCreateResponse>(res);
}

export async function createOrResumeFlowSession(input: {
  sessionId?: string;
  sourceType: FlowSourceType;
  sourceContext?: FlowSourceContext;
  currentObligationId: string;
  currentJourneyId?: string;
  reuseLatest?: boolean;
}): Promise<FlowSessionResponse> {
  const res = await apiFetch("/flow-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<FlowSessionResponse>(res);
}

export async function getAutoFlow(params?: {
  limit?: number;
  includeAccepted?: boolean;
}): Promise<AutoFlowListResponse> {
  const query = new URLSearchParams();
  if (typeof params?.limit === "number") {
    query.set("limit", String(params.limit));
  }
  if (params?.includeAccepted) {
    query.set("includeAccepted", "true");
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/auto-flow${suffix}`, {
    cache: "no-store"
  });
  return handleResponse<AutoFlowListResponse>(res);
}

export async function triggerAutoFlow(input: {
  obligationId: string;
  triggerType?:
    | "INGESTION_TRIGGER"
    | "URGENCY_TRIGGER"
    | "PATTERN_TRIGGER"
    | "REMINDER_TRIGGER";
  source?: string;
}) {
  const res = await apiFetch("/auto-flow/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<{ triggered: boolean; item?: unknown }>(res);
}

export async function acceptAutoFlow(autoFlowId: string) {
  const res = await apiFetch(`/auto-flow/${autoFlowId}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return handleResponse<{ item: unknown }>(res);
}

export async function dismissAutoFlow(autoFlowId: string, reason?: string) {
  const res = await apiFetch(`/auto-flow/${autoFlowId}/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });
  return handleResponse<{ item: unknown }>(res);
}

export async function getFlowSessionById(sessionId: string): Promise<FlowSessionResponse> {
  const res = await apiFetch(`/flow-sessions/${sessionId}`, {
    cache: "no-store"
  });

  return handleResponse<FlowSessionResponse>(res);
}

export async function completeFlowSessionStep(
  sessionId: string,
  input?: {
    obligationId?: string;
    journeyId?: string;
  }
): Promise<FlowSessionResponse> {
  const res = await apiFetch(`/flow-sessions/${sessionId}/complete-step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {})
  });

  return handleResponse<FlowSessionResponse>(res);
}

export async function moveFlowSessionNext(
  sessionId: string,
  input?: {
    preferredObligationId?: string;
  }
): Promise<FlowSessionResponse> {
  const res = await apiFetch(`/flow-sessions/${sessionId}/next`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {})
  });

  return handleResponse<FlowSessionResponse>(res);
}

export async function abandonFlowSession(sessionId: string): Promise<FlowSessionResponse> {
  const res = await apiFetch(`/flow-sessions/${sessionId}/abandon`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<FlowSessionResponse>(res);
}

export async function createFocusSession(input: {
  durationMinutes: 5 | 10 | 15;
  sourceType?: FlowSourceType;
}): Promise<FocusSessionCreateResponse> {
  const res = await apiFetch("/focus-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<FocusSessionCreateResponse>(res);
}

export async function getActiveFocusSession(): Promise<FocusSessionResponse> {
  const res = await apiFetch("/focus-sessions/active", {
    cache: "no-store"
  });

  return handleResponse<FocusSessionResponse>(res);
}

export async function getFocusSessionById(sessionId: string): Promise<FocusSessionResponse> {
  const res = await apiFetch(`/focus-sessions/${sessionId}`, {
    cache: "no-store"
  });

  return handleResponse<FocusSessionResponse>(res);
}

export async function startFocusSession(sessionId: string): Promise<FocusSessionResponse> {
  const res = await apiFetch(`/focus-sessions/${sessionId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<FocusSessionResponse>(res);
}

export async function completeFocusSessionItem(
  sessionId: string,
  obligationId: string
): Promise<FocusSessionResponse> {
  const res = await apiFetch(`/focus-sessions/${sessionId}/items/${obligationId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<FocusSessionResponse>(res);
}

export async function postponeFocusSessionItem(
  sessionId: string,
  obligationId: string,
  input?: {
    until?: string;
    reason?: string;
  }
): Promise<FocusSessionResponse> {
  const res = await apiFetch(`/focus-sessions/${sessionId}/items/${obligationId}/postpone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {})
  });

  return handleResponse<FocusSessionResponse>(res);
}

export async function dismissFocusSessionItem(
  sessionId: string,
  obligationId: string,
  reason?: string
): Promise<FocusSessionResponse> {
  const res = await apiFetch(`/focus-sessions/${sessionId}/items/${obligationId}/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });

  return handleResponse<FocusSessionResponse>(res);
}

export async function skipFocusSessionItem(
  sessionId: string,
  obligationId: string
): Promise<FocusSessionResponse> {
  const res = await apiFetch(`/focus-sessions/${sessionId}/items/${obligationId}/skip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<FocusSessionResponse>(res);
}

export async function nextFocusSessionItem(sessionId: string): Promise<FocusSessionResponse> {
  const res = await apiFetch(`/focus-sessions/${sessionId}/next`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<FocusSessionResponse>(res);
}

export async function completeFocusSession(sessionId: string): Promise<FocusSessionResponse> {
  const res = await apiFetch(`/focus-sessions/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<FocusSessionResponse>(res);
}

export async function abandonFocusSession(sessionId: string): Promise<FocusSessionResponse> {
  const res = await apiFetch(`/focus-sessions/${sessionId}/abandon`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<FocusSessionResponse>(res);
}

export async function getActiveGuidedJourneyForObligation(
  obligationId: string
): Promise<GuidedJourneyMaybeResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/guided-journey`, {
    cache: "no-store"
  });

  return handleResponse<GuidedJourneyMaybeResponse>(res);
}

export async function getGuidedJourneyById(journeyId: string): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}`, {
    cache: "no-store"
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function selectGuidedJourneyOption(
  journeyId: string,
  optionKey: string
): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optionKey })
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function advanceGuidedJourney(
  journeyId: string,
  completeCurrentStep = true
): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completeCurrentStep })
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function backGuidedJourney(journeyId: string): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}/back`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function completeGuidedJourney(journeyId: string): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function abandonGuidedJourney(journeyId: string): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}/abandon`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function dismissGuidedJourney(journeyId: string): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function getDailyPulse(params?: {
  markOpened?: boolean;
  refresh?: boolean;
  includeTrace?: boolean;
}): Promise<DailyPulseApiResponse> {
  const query = new URLSearchParams();
  if (typeof params?.markOpened === "boolean") {
    query.set("markOpened", params.markOpened ? "true" : "false");
  }
  if (typeof params?.refresh === "boolean") {
    query.set("refresh", params.refresh ? "true" : "false");
  }
  if (params?.includeTrace) {
    query.set("includeTrace", "true");
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const res = await apiFetch(`/daily-pulse${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<DailyPulseApiResponse>(res);
}

export async function getDailyPulseState(): Promise<DailyPulseStateApiResponse> {
  const res = await apiFetch("/daily-pulse/state", {
    cache: "no-store"
  });

  return handleResponse<DailyPulseStateApiResponse>(res);
}

export async function openDailyPulse() {
  const res = await apiFetch("/daily-pulse/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<{
    date: string;
    openedAt?: string | null;
    progress: DailyPulseProgressResponse["progress"];
    momentum: DailyPulseProgressResponse["momentum"];
  }>(res);
}

export async function getDailyPulseProgress(): Promise<DailyPulseProgressApiResponse> {
  const res = await apiFetch("/daily-pulse/progress", {
    cache: "no-store"
  });

  return handleResponse<DailyPulseProgressApiResponse>(res);
}

export async function completeDailyPulseItem(
  obligationId: string
): Promise<DailyPulseItemUpdateApiResponse> {
  const res = await apiFetch(`/daily-pulse/items/${obligationId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<DailyPulseItemUpdateApiResponse>(res);
}

export async function postponeDailyPulseItem(
  obligationId: string
): Promise<DailyPulseItemUpdateApiResponse> {
  const res = await apiFetch(`/daily-pulse/items/${obligationId}/postpone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<DailyPulseItemUpdateApiResponse>(res);
}

export async function dismissDailyPulseItem(
  obligationId: string
): Promise<DailyPulseItemUpdateApiResponse> {
  const res = await apiFetch(`/daily-pulse/items/${obligationId}/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<DailyPulseItemUpdateApiResponse>(res);
}

export async function openGuidedDailyPulseItem(
  obligationId: string
): Promise<DailyPulseItemUpdateApiResponse> {
  const res = await apiFetch(`/daily-pulse/items/${obligationId}/open-guided`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<DailyPulseItemUpdateApiResponse>(res);
}

export async function trackDailyPulseAction(action: "COMPLETED" | "DISMISSED" | "POSTPONED") {
  const res = await apiFetch("/daily-pulse/track-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action })
  });

  return handleResponse<{
    date: string;
    openedAt?: string | null;
    completedCount: number;
    dismissedCount: number;
  }>(res);
}

export async function getAdminMetrics(params?: {
  userId?: string;
  householdId?: string;
}): Promise<AdminMetricsOverviewResponse> {
  const query = new URLSearchParams();
  if (params?.userId) query.set("userId", params.userId);
  if (params?.householdId) query.set("householdId", params.householdId);
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/admin/metrics${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<AdminMetricsOverviewResponse>(res);
}

export async function getAdminMetricByType(
  metricType: string,
  params?: {
    timeBucket?: "DAY" | "WEEK" | "MONTH";
    limit?: number;
    userId?: string;
    householdId?: string;
  }
): Promise<AdminMetricSeriesResponse> {
  const query = new URLSearchParams();
  if (params?.timeBucket) query.set("timeBucket", params.timeBucket);
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  if (params?.userId) query.set("userId", params.userId);
  if (params?.householdId) query.set("householdId", params.householdId);
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/admin/metrics/${encodeURIComponent(metricType)}${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<AdminMetricSeriesResponse>(res);
}

export async function getAdminMetricTrends(params?: {
  metricTypes?: string[];
  timeBucket?: "DAY" | "WEEK" | "MONTH";
  limit?: number;
  userId?: string;
  householdId?: string;
}): Promise<AdminMetricTrendsResponse> {
  const query = new URLSearchParams();
  if (params?.metricTypes?.length) query.set("metricTypes", params.metricTypes.join(","));
  if (params?.timeBucket) query.set("timeBucket", params.timeBucket);
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  if (params?.userId) query.set("userId", params.userId);
  if (params?.householdId) query.set("householdId", params.householdId);
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/admin/metrics/trends${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<AdminMetricTrendsResponse>(res);
}

export async function getAdminEvents(params?: {
  eventType?: string;
  entityType?: string;
  entityId?: string;
  traceId?: string;
  correlationId?: string;
  userId?: string;
  householdId?: string;
  start?: string;
  end?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminObservabilityEventsResponse> {
  const query = new URLSearchParams();
  if (params?.eventType) query.set("eventType", params.eventType);
  if (params?.entityType) query.set("entityType", params.entityType);
  if (params?.entityId) query.set("entityId", params.entityId);
  if (params?.traceId) query.set("traceId", params.traceId);
  if (params?.correlationId) query.set("correlationId", params.correlationId);
  if (params?.userId) query.set("userId", params.userId);
  if (params?.householdId) query.set("householdId", params.householdId);
  if (params?.start) query.set("start", params.start);
  if (params?.end) query.set("end", params.end);
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  if (typeof params?.offset === "number") query.set("offset", String(params.offset));
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/admin/events${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<AdminObservabilityEventsResponse>(res);
}

export async function getAdminAlerts(params?: {
  userId?: string;
  householdId?: string;
}): Promise<AdminAlertsResponse> {
  const query = new URLSearchParams();
  if (params?.userId) query.set("userId", params.userId);
  if (params?.householdId) query.set("householdId", params.householdId);
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/admin/alerts${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<AdminAlertsResponse>(res);
}

export async function getSubscriptionDecisionFlow(subscriptionId: string) {
  const res = await apiFetch(`/subscriptions/review/${subscriptionId}/review-flow`, {
    cache: "no-store"
  });
  return handleResponse<SubscriptionDecisionFlowData>(res);
}

export async function applySubscriptionReviewAction(
  subscriptionId: string,
  input: {
    action: "KEEP" | "CANCEL" | "REMIND_LATER" | "REVIEWED";
    remindAt?: string | null;
    note?: string | null;
  }
) {
  const res = await apiFetch(`/subscriptions/review/${subscriptionId}/review-actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return handleResponse<{ success: boolean; action: string; subscriptionId: string; nextState: string }>(res);
}
