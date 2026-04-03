import Link from "next/link";
import PageHeader from "../../components/ui/page-header";
import { getObligations } from "../../lib/api";
import type { Obligation } from "../../lib/types";
import { cardStyles, colors, formatDateTime, pageStyles } from "../../lib/ui";

export default async function ObligationsPage() {
  const data = await getObligations();
  const items: Obligation[] = data.items ?? [];

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
        {items.map((item) => (
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
        ))}
      </div>
    </main>
  );
}
