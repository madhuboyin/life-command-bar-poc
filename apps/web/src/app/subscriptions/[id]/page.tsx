import Link from "next/link";
import { notFound } from "next/navigation";
import SubscriptionConfirmationForm from "../../../components/subscription-confirmation-form";
import SubscriptionDetailHeader from "../../../components/subscription-detail-header";
import SubscriptionEvidenceList from "../../../components/subscription-evidence-list";
import SubscriptionInsightCard from "../../../components/subscription-insight-card";
import SubscriptionMergePanel from "../../../components/subscription-merge-panel";
import SubscriptionPriceHistory from "../../../components/subscription-price-history";
import SubscriptionRecommendationCard from "../../../components/subscription-recommendation-card";
import { getSubscriptionById } from "../../../lib/api";
import { cardStyles, colors, pageStyles } from "../../../lib/ui";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SubscriptionDetailPage({ params }: Props) {
  const resolved = await params;
  const id = resolved.id;

  let subscription: Awaited<ReturnType<typeof getSubscriptionById>>["subscription"] | null = null;
  let error: string | null = null;

  try {
    const data = await getSubscriptionById(id);
    subscription = data.subscription;
  } catch (fetchError) {
    if (fetchError instanceof Error && fetchError.message.toLowerCase().includes("not found")) {
      notFound();
    }
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load subscription details.";
  }

  if (!subscription && !error) {
    notFound();
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/subscriptions" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to subscriptions
        </Link>
      </div>

      {error || !subscription ? (
        <section style={{ ...cardStyles.bordered, color: colors.errorText }}>
          {error ?? "Subscription not found"}
        </section>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <section style={{ ...cardStyles.section }}>
            <SubscriptionDetailHeader subscription={subscription} />
          </section>

          {subscription.optimization ? (
            <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
              <h2 style={{ margin: 0 }}>Optimization Recommendation</h2>
              <SubscriptionRecommendationCard
                recommendation={subscription.optimization.recommendation}
              />
            </section>
          ) : null}

          {subscription.optimization && subscription.optimization.insights.length > 0 ? (
            <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
              <h2 style={{ margin: 0 }}>Insights</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {subscription.optimization.insights.map((insight) => (
                  <SubscriptionInsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </section>
          ) : null}

          <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0 }}>Linked Obligations</h2>
            {subscription.linkedObligations.length === 0 ? (
              <div style={{ color: colors.textMuted, fontSize: 13 }}>No linked obligations yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {subscription.linkedObligations.map((item) => (
                  <div key={item.id} style={{ ...cardStyles.bordered, display: "grid", gap: 4 }}>
                    <Link href={`/obligations/${item.id}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                      {item.title}
                    </Link>
                    <div style={{ color: colors.textMuted, fontSize: 13 }}>
                      {item.type} · {item.status}
                      {item.dueDate ? ` · Due ${item.dueDate.slice(0, 10)}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0 }}>Evidence Timeline</h2>
            <SubscriptionEvidenceList items={subscription.evidence} />
          </section>

          <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0 }}>Status Updates</h2>
            {subscription.lifecycleEvents.length === 0 ? (
              <div style={{ ...cardStyles.bordered, color: colors.textMuted, fontSize: 13 }}>
                No status updates yet.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {subscription.lifecycleEvents.map((event) => (
                  <div key={event.id} style={{ ...cardStyles.bordered, display: "grid", gap: 5 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {event.eventType.toLowerCase().replace(/_/g, " ")}
                    </div>
                    <div style={{ color: colors.textMuted, fontSize: 13 }}>
                      {event.previousState ? event.previousState.toLowerCase() : "unknown"} →{" "}
                      {event.nextState ? event.nextState.toLowerCase() : "unknown"}
                    </div>
                    <div style={{ color: colors.textMuted, fontSize: 12 }}>
                      {event.eventDate ? event.eventDate.slice(0, 10) : event.createdAt.slice(0, 10)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0 }}>Price History</h2>
            <SubscriptionPriceHistory items={subscription.priceHistory} />
          </section>

          <section style={{ ...cardStyles.section, display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0 }}>Review Decision</h2>
            <div style={{ color: colors.textMuted }}>
              Use the focused review flow to quickly choose keep, cancel, or remind later.
            </div>
            <div>
              <Link href={`/subscriptions/review/${subscription.id}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                Open subscription review flow →
              </Link>
            </div>
          </section>

          <SubscriptionConfirmationForm subscription={subscription} />
          <SubscriptionMergePanel primarySubscriptionId={subscription.id} />
        </div>
      )}
    </main>
  );
}
