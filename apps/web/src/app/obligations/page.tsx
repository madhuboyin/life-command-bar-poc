import Link from "next/link";
import PageHeader from "../../components/ui/page-header";
import { getObligations } from "../../lib/api";
import {
  getViewSortSummary,
  obligationViewMeta,
  parseObligationSort,
  parseObligationView,
  parseSortDirection
} from "../../lib/obligation-filters";
import type {
  Obligation,
  ObligationSort,
  ObligationView,
  SortDirection
} from "../../lib/types";
import { cardStyles, colors, pageStyles } from "../../lib/ui";
import EmptyState from "../../components/ui/empty-state";
import StatusMessage from "../../components/ui/status-message";
import ObligationListItemCard from "../../components/obligation-list-item-card";

type Props = {
  searchParams?: Promise<{
    view?: string | string[];
    sort?: string | string[];
    direction?: string | string[];
  } | undefined>;
};

export default async function ObligationsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawView = readFirstParam(params.view);
  const rawSort = readFirstParam(params.sort);
  const rawDirection = readFirstParam(params.direction);

  const view: ObligationView | null = parseObligationView(rawView);
  const sort: ObligationSort | null = parseObligationSort(rawSort);
  const direction: SortDirection | null = parseSortDirection(rawDirection);

  const invalidView = typeof rawView === "string" && rawView.length > 0 && !view;
  const invalidSort = typeof rawSort === "string" && rawSort.length > 0 && !sort;
  const invalidDirection =
    typeof rawDirection === "string" && rawDirection.length > 0 && !direction;

  let items: Obligation[] = [];
  let total = 0;
  let loadError: string | null = null;

  try {
    const data = await getObligations({
      view: view ?? undefined,
      sort: sort ?? undefined,
      direction: direction ?? undefined
    });
    items = data.items ?? [];
    total = data.pagination.total ?? 0;
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Could not load obligations right now.";
  }

  const selectedMeta = view ? obligationViewMeta[view] : null;
  const sortSummary = getViewSortSummary(view, sort, direction);

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to Today Feed
        </Link>
      </div>

      <PageHeader
        title="All Obligations"
        description={
          selectedMeta
            ? `Showing ${selectedMeta.label.toLowerCase()} obligations.`
            : "Current obligations loaded from Postgres via Prisma."
        }
      />

      <div style={{ display: "grid", gap: 14 }}>
        {invalidView ? (
          <StatusMessage variant="error">
            Unknown filter view. Showing all obligations instead.
          </StatusMessage>
        ) : null}

        {invalidSort ? (
          <StatusMessage variant="error">
            Unknown sort value. Using the default ordering instead.
          </StatusMessage>
        ) : null}

        {invalidDirection ? (
          <StatusMessage variant="error">
            Unknown sort direction. Using the default direction instead.
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
                <div style={{ marginTop: 8, fontSize: 13, color: colors.textMuted }}>
                  {sortSummary} {total} {total === 1 ? "item" : "items"} found.
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
                ? obligationViewMeta[view].emptyDescription
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
          ? items.map((item) => <ObligationListItemCard key={item.id} item={item} />)
          : null}
      </div>
    </main>
  );
}

function readFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}
