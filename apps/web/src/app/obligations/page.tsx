import Link from "next/link";
import { getObligations } from "../../lib/api";
import type { Obligation } from "../../lib/types";

function formatDueDate(value?: string | null) {
  if (!value) return "No due date";
  return new Date(value).toLocaleString();
}

export default async function ObligationsPage() {
  const data = await getObligations();
  const items: Obligation[] = data.items ?? [];

  return (
    <main style={{ maxWidth: 980, margin: "40px auto", padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to Today Feed
        </Link>
      </div>

      <h1 style={{ marginBottom: 8 }}>All Obligations</h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Current obligations loaded from Postgres via Prisma.
      </p>

      <div style={{ display: "grid", gap: 14 }}>
        {items.map((item) => (
          <article
            key={item.id}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 16
            }}
          >
            <h3 style={{ margin: "0 0 8px 0" }}>{item.title}</h3>
            <div style={{ color: "#6b7280", fontSize: 14 }}>
              {item.type} · {item.status} · Due: {formatDueDate(item.dueDate)}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
