import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getHousehold, getHouseholdControlTower } from "../../../../lib/api";
import { cardStyles, colors, pageStyles } from "../../../../lib/ui";

type Props = {
  params?: Promise<{ id?: string } | undefined>;
};

export default async function HouseholdControlTowerPage({ params }: Props) {
  const resolved = (await params) ?? {};
  const householdId = resolved.id;
  if (!householdId) {
    notFound();
  }

  try {
    const [householdRes, tower] = await Promise.all([
      getHousehold(householdId),
      getHouseholdControlTower(householdId)
    ]);

    return (
      <main style={pageStyles.shell}>
        <div style={{ marginBottom: 14 }}>
          <Link href={`/households/${householdId}`} style={{ color: "#2563eb", textDecoration: "none" }}>
            ← Back to household overview
          </Link>
        </div>

        <h1 style={{ marginTop: 0 }}>{householdRes.household.name} Control Tower</h1>
        <p style={{ color: colors.textMuted, marginTop: -4 }}>
          Shared review, ready, approvals, upcoming, and recent decisions.
        </p>

        <section style={{ ...cardStyles.section, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill label={`Review ${tower.summary.reviewCount}`} />
            <Pill label={`Ready ${tower.summary.readyCount}`} />
            <Pill label={`Approvals ${tower.summary.approvalCount}`} />
            <Pill label={`Upcoming ${tower.summary.upcomingCount}`} />
            <Pill label={`Recent ${tower.summary.recentCount}`} />
          </div>
        </section>

        <Section title="Needs Review">
          {tower.review.map((item) => (
            <article key={item.obligationId} style={cardStyles.item}>
              <div style={{ fontWeight: 700 }}>{item.title}</div>
              <div style={{ color: colors.textMuted, fontSize: 13 }}>{item.whyShown}</div>
            </article>
          ))}
        </Section>

        <Section title="Ready">
          {tower.ready.map((item) => (
            <article key={item.obligationId} style={cardStyles.item}>
              <div style={{ fontWeight: 700 }}>{item.title}</div>
              <div style={{ color: colors.textMuted, fontSize: 13 }}>{item.whyShown}</div>
            </article>
          ))}
        </Section>

        <Section title="Approval Needed">
          {tower.approvals.map((item) => (
            <article key={item.id} style={cardStyles.item}>
              <div style={{ fontWeight: 700 }}>{item.title}</div>
              <div style={{ color: colors.textMuted, fontSize: 13 }}>
                {item.candidateAction} · {item.status}
              </div>
            </article>
          ))}
        </Section>

        <Section title="Upcoming">
          {tower.upcoming.map((item) => (
            <article key={item.id} style={cardStyles.item}>
              <div style={{ fontWeight: 700 }}>{item.title}</div>
              <div style={{ color: colors.textMuted, fontSize: 13 }}>
                {item.predictedDate ? new Date(item.predictedDate).toLocaleDateString() : "Windowed"} · {item.confidenceBand}
              </div>
            </article>
          ))}
        </Section>
      </main>
    );
  } catch {
    notFound();
  }
}

function Pill({ label }: { label: string }) {
  return (
    <span
      style={{
        borderRadius: 999,
        background: "#eef2ff",
        color: "#3730a3",
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 700
      }}
    >
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ ...cardStyles.section, marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </section>
  );
}
