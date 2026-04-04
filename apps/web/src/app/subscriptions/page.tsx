import Link from "next/link";
import SubscriptionRegistryCard from "../../components/subscription-registry-card";
import { getSubscriptions } from "../../lib/api";
import type {
  SubscriptionLifecycleState,
  SubscriptionRegistryListResponse
} from "../../lib/types";
import { cardStyles, colors, pageStyles } from "../../lib/ui";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined> | undefined>;
};

const EMPTY_DATA: SubscriptionRegistryListResponse = {
  items: [],
  pagination: {
    total: 0,
    limit: 25,
    offset: 0
  }
};

export default async function SubscriptionsPage({ searchParams }: Props) {
  const resolved = (await searchParams) ?? {};
  const lifecycle = firstSearchParam(resolved.lifecycleState);
  const lifecycleState = isLifecycleState(lifecycle) ? lifecycle : undefined;

  let data = EMPTY_DATA;
  let error: string | null = null;

  try {
    data = await getSubscriptions({
      lifecycleState,
      limit: 50,
      offset: 0
    });
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load subscription registry.";
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to dashboard
        </Link>
      </div>

      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: "0 0 8px 0" }}>Subscription Registry</h1>
        <p style={{ margin: 0, color: colors.textMuted }}>
          Canonical subscriptions consolidated from Gmail lifecycle signals and other ingestion evidence.
        </p>
      </header>

      <section style={{ ...cardStyles.bordered, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: colors.textMuted }}>
          Showing {data.items.length} of {data.pagination.total} subscriptions
          {lifecycleState ? ` · Filter ${lifecycleState.toLowerCase()}` : ""}
        </div>
      </section>

      {error ? (
        <section style={{ ...cardStyles.bordered, color: colors.errorText }}>{error}</section>
      ) : data.items.length === 0 ? (
        <section style={{ ...cardStyles.bordered, color: colors.textMuted }}>
          No subscriptions found yet. Connect Gmail and run sync to discover subscription lifecycle signals.
        </section>
      ) : (
        <section style={{ display: "grid", gap: 10 }}>
          {data.items.map((item) => (
            <SubscriptionRegistryCard key={item.id} subscription={item} />
          ))}
        </section>
      )}
    </main>
  );
}

function firstSearchParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

function isLifecycleState(value: string | null): value is SubscriptionLifecycleState {
  return (
    value === "DISCOVERED" ||
    value === "TRIALING" ||
    value === "ACTIVE" ||
    value === "RENEWING" ||
    value === "PRICE_CHANGED" ||
    value === "CANCELING" ||
    value === "CANCELED" ||
    value === "ENDED" ||
    value === "INACTIVE" ||
    value === "UNKNOWN"
  );
}
