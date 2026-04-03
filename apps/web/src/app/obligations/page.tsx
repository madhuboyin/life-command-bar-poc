import Link from "next/link";
import PageHeader from "../../components/ui/page-header";
import { getObligations } from "../../lib/api";
import type { Obligation } from "../../lib/types";
import { cardStyles, colors, formatDateTime, pageStyles } from "../../lib/ui";
import EmptyState from "../../components/ui/empty-state";
import StatusMessage from "../../components/ui/status-message";

export default async function ObligationsPage() {
  let items: Obligation[] = [];
  let loadError: string | null = null;

  try {
    const data = await getObligations();
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
        {loadError ? <StatusMessage variant="error">{loadError}</StatusMessage> : null}

        {!loadError && items.length === 0 ? (
          <EmptyState
            title="No obligations yet"
            description="Create or import an obligation to get started."
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
