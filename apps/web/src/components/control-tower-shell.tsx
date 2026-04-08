"use client";

import Link from "next/link";
import { useState } from "react";
import { getControlTower } from "../lib/api";
import type {
  ControlTowerResponse,
  ControlTowerSubscriptionOptimizationItem
} from "../lib/types";
import { buttonStyles, cardStyles, colors, pageStyles } from "../lib/ui";
import ControlItemCard from "./control-item-card";
import ControlSection from "./control-section";
import PageHeader from "./ui/page-header";
import EmptyState from "./ui/empty-state";
import StatusMessage from "./ui/status-message";

type Props = {
  initialData: ControlTowerResponse | null;
  initialError?: string | null;
};

const EMPTY_CONTROL_TOWER: ControlTowerResponse = {
  generatedAt: new Date().toISOString(),
  review: [],
  approvals: [],
  ready: [],
  upcoming: {
    windows: [],
    items: []
  },
  recent: [],
  systemDecisions: [],
  subscriptionOptimization: {
    renewingSoon: [],
    priceIncreased: [],
    potentiallyUnused: [],
    needsReview: []
  },
  summary: {
    reviewCount: 0,
    approvalCount: 0,
    readyCount: 0,
    upcomingCount: 0,
    recentCount: 0,
    systemDecisionCount: 0,
    subscriptionOptimizationCount: 0
  }
};

export default function ControlTowerShell({ initialData, initialError = null }: Props) {
  const [data, setData] = useState<ControlTowerResponse>(initialData ?? EMPTY_CONTROL_TOWER);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const next = await getControlTower({
        reviewLimit: 6,
        approvalLimit: 6,
        readyLimit: 6,
        upcomingLimitPerWindow: 4,
        recentLimit: 6,
        systemDecisionsLimit: 6
      });
      setData(next);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not load control tower right now"
      );
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
        title="Control Tower"
        description="One calm surface for review, ready actions, upcoming signals, and visible system decisions."
        actions={
          <button type="button" onClick={() => void refresh()} disabled={loading} style={buttonStyles.secondary}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      <section style={{ ...cardStyles.bordered, marginBottom: 16, background: "#ffffff" }}>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>At a glance</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill label={`Needs review ${data.summary.reviewCount}`} />
          <Pill label={`Approval needed ${data.summary.approvalCount}`} />
          <Pill label={`Ready now ${data.summary.readyCount}`} />
          <Pill label={`Upcoming ${data.summary.upcomingCount}`} />
          <Pill label={`Recent ${data.summary.recentCount}`} />
          <Pill label={`System decisions ${data.summary.systemDecisionCount}`} />
          <Pill label={`Subscriptions ${data.summary.subscriptionOptimizationCount}`} />
        </div>
        <div style={{ marginTop: 10 }}>
          <Link href="/subscriptions/review" style={buttonStyles.link}>
            Open Subscription Review Hub
          </Link>
        </div>
      </section>

      <ControlSection
        title="Renewing Soon"
        description="Subscriptions with upcoming renewals that likely need a keep/cancel decision."
        count={data.subscriptionOptimization.renewingSoon.length}
      >
        <SubscriptionOptimizationList items={data.subscriptionOptimization.renewingSoon} />
      </ControlSection>

      <ControlSection
        title="Price Increased"
        description="Detected recurring price increases tied to subscription lifecycle evidence."
        count={data.subscriptionOptimization.priceIncreased.length}
      >
        <SubscriptionOptimizationList items={data.subscriptionOptimization.priceIncreased} />
      </ControlSection>

      <ControlSection
        title="Potentially Unused"
        description="Subscriptions with inactivity or weak value signals."
        count={data.subscriptionOptimization.potentiallyUnused.length}
        defaultCollapsedOnMobile
      >
        <SubscriptionOptimizationList items={data.subscriptionOptimization.potentiallyUnused} />
      </ControlSection>

      <ControlSection
        title="Subscription Needs Review"
        description="Conflicts, low-confidence states, and plan mismatches routed for review."
        count={data.subscriptionOptimization.needsReview.length}
        defaultCollapsedOnMobile
      >
        <SubscriptionOptimizationList items={data.subscriptionOptimization.needsReview} />
      </ControlSection>

      <div style={{ display: "grid", gap: 16 }}>
        <ControlSection
          title="Needs Review"
          description="Candidates and predictions that need your confirmation before activation."
          count={data.review.length}
        >
          {data.review.length === 0 ? (
            <EmptyState
              title="Nothing waiting for review"
              description="New medium/low confidence items will appear here for quick confirmation."
              action={
                <Link href="/review" style={buttonStyles.link}>
                  Open review queue
                </Link>
              }
            />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {data.review.map((item) => (
                <ControlItemCard key={item.id} section="review" item={item} onUpdated={refresh} />
              ))}
            </div>
          )}
        </ControlSection>

        <ControlSection
          title="Approval Needed"
          description="Safe automation requests awaiting your explicit approval."
          count={data.approvals.length}
        >
          {data.approvals.length === 0 ? (
            <EmptyState
              title="No approvals waiting"
              description="Higher-sensitivity actions will appear here before they run."
            />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {data.approvals.map((item) => (
                <ControlItemCard key={item.id} section="approvals" item={item} onUpdated={refresh} />
              ))}
            </div>
          )}
        </ControlSection>

        <ControlSection
          title="Ready Now"
          description="High-confidence actions prepared for immediate guided execution."
          count={data.ready.length}
        >
          {data.ready.length === 0 ? (
            <EmptyState
              title="No ready-now items"
              description="When urgency and confidence align, we will stage a ready-to-handle action here."
            />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {data.ready.map((item) => (
                <ControlItemCard key={item.id} section="ready" item={item} onUpdated={refresh} />
              ))}
            </div>
          )}
        </ControlSection>

        <ControlSection
          title="Upcoming"
          description="Near-future signals from recurring patterns and prediction windows."
          count={data.upcoming.items.length}
          defaultCollapsedOnMobile
        >
          {data.upcoming.windows.length === 0 || data.upcoming.items.length === 0 ? (
            <EmptyState
              title="No strong upcoming signals"
              description="As recurring behavior stabilizes, likely future obligations will appear here."
              action={
                <Link href="/upcoming" style={buttonStyles.link}>
                  Open upcoming view
                </Link>
              }
            />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {data.upcoming.windows
                .filter((window) => window.items.length > 0)
                .map((window) => (
                  <div key={`window_${window.windowDays}`} style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 13, color: colors.textMuted, fontWeight: 600 }}>
                      Next {window.windowDays} days
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {window.items.map((item) => (
                        <ControlItemCard
                          key={item.id}
                          section="upcoming"
                          item={item}
                          onUpdated={refresh}
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </ControlSection>

        <ControlSection
          title="Recently Handled"
          description="Recent outcomes so you can verify progress and trust the system loop."
          count={data.recent.length}
          defaultCollapsedOnMobile
        >
          {data.recent.length === 0 ? (
            <EmptyState
              title="No recent actions yet"
              description="Completed and handled actions will appear here as activity accumulates."
            />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {data.recent.map((item) => (
                <ControlItemCard key={item.id} section="recent" item={item} onUpdated={refresh} />
              ))}
            </div>
          )}
        </ControlSection>

        <ControlSection
          title="System Decisions"
          description="Transparent internal routing decisions, suppressions, and confidence changes."
          count={data.systemDecisions.length}
          defaultCollapsedOnMobile
        >
          {data.systemDecisions.length === 0 ? (
            <EmptyState
              title="No decision events to show"
              description="As the system routes and suppresses items, those decisions will appear here."
            />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {data.systemDecisions.map((item) => (
                <ControlItemCard
                  key={item.id}
                  section="systemDecisions"
                  item={item}
                  onUpdated={refresh}
                />
              ))}
            </div>
          )}
        </ControlSection>
      </div>
    </main>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span
      style={{
        borderRadius: 999,
        background: colors.neutralBadgeBg,
        color: colors.neutralBadgeText,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 700
      }}
    >
      {label}
    </span>
  );
}

function SubscriptionOptimizationList({
  items
}: {
  items: ControlTowerSubscriptionOptimizationItem[];
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No items right now"
        description="High-signal subscription insights will appear here."
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((item) => (
        <article key={item.id} style={{ ...cardStyles.item, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: "0 0 4px 0", fontSize: 16 }}>{item.title}</h3>
              <div style={{ color: colors.textMuted, fontSize: 13 }}>
                {item.vendorName} · {item.lifecycleState.toLowerCase()}
              </div>
            </div>
            <span
              style={{
                borderRadius: 999,
                background:
                  item.severity === "HIGH"
                    ? colors.dangerBg
                    : item.severity === "MEDIUM"
                      ? colors.quickWinBg
                      : colors.neutralBadgeBg,
                color:
                  item.severity === "HIGH"
                    ? colors.dangerText
                    : item.severity === "MEDIUM"
                      ? colors.quickWinText
                      : colors.neutralBadgeText,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 700
              }}
            >
              {item.severity.toLowerCase()}
            </span>
          </div>

          <div style={{ color: colors.textMuted, fontSize: 14 }}>{item.insightDescription}</div>
          <div style={{ fontSize: 13 }}>
            Recommendation {item.recommendationType.toLowerCase()} · Health {item.healthScore}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/subscriptions/review/${item.subscriptionId}`} style={buttonStyles.link}>
              {item.ctaLabel}
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
