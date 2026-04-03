import Link from "next/link";
import PageHeader from "../../components/ui/page-header";
import { getObligations } from "../../lib/api";
import { obligationViewMeta, parseObligationView } from "../../lib/obligation-filters";
import type { Obligation, ObligationView } from "../../lib/types";
import { cardStyles, colors, formatDateTime, pageStyles } from "../../lib/ui";
import EmptyState from "../../components/ui/empty-state";
import StatusMessage from "../../components/ui/status-message";

type Props = {
  searchParams?: Promise<{
    view?: string;
  } | undefined>;
};

export default async function ObligationsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawView = params.view;
  const view: ObligationView | null = parseObligationView(rawView);
  const invalidView = typeof rawView === "string" && rawView.length > 0 && !view;

  let items: Obligation[] = [];
  let loadError: string | null = null;

  try {
    const data = await getObligations({
      view: view ?? undefined
    });
    items = data.items ?? [];
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Could not load obligations right now.";
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to Today Feed
        </Link>
      </div>

      <PageHeader
        title="All Obligations"
        description="Current obligations loaded from Postgres via Prisma."
      />

      <div style={{ display: "grid", gap: 14 }}>
        {invalidView ? (
          <StatusMessage variant="error">
            Unknown filter view. Showing all obligations instead.
          </StatusMessage>
        ) : null}

        {view ? (
          <section style={cardStyles.bordered}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
                  Filtered view
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                  {obligationViewMeta[view].label}
                </div>
                <div style={{ fontSize: 14, color: colors.textMuted }}>
                  {obligationViewMeta[view].description}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <Link href="/obligations" style={{ textDecoration: "none", color: "#2563eb", fontWeight: 600 }}>
                  Clear filter
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        {loadError ? <StatusMessage variant="error">{loadError}</StatusMessage> : null}

        {!loadError && items.length === 0 ? (
          <EmptyState
            title={view ? `No items in ${obligationViewMeta[view].label}` : "No obligations yet"}
            description={
              view
                ? "No obligations match this filter right now."
                : "Create or import an obligation to get started."
            }
            action={
              view ? (
                <Link href="/obligations" style={{ textDecoration: "none", color: "#2563eb", fontWeight: 600 }}>
                  Clear filter
                </Link>
              ) : (
                undefined
              )
            }
          />
        ) : null}

        {!loadError
          ? items.map((item) => (
              <Link
                key={item.id}
                href={`/obligations/${item.id}`}
                style={{
                  ...cardStyles.item,
                  textDecoration: "none",
                  color: colors.text,
                  display: "block"
                }}
              >
                <h3 style={{ margin: "0 0 8px 0" }}>{item.title}</h3>
                <div style={{ color: colors.textMuted, fontSize: 14 }}>
                  {item.type} · {item.status} · Due: {formatDateTime(item.dueDate)}
                </div>
              </Link>
            ))
          : null}
      </div>
    </main>
  );
}
