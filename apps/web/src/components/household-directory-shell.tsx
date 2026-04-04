"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createHousehold } from "../lib/api";
import type { HouseholdSummary } from "../lib/types";
import { buttonStyles, cardStyles, inputStyles, pageStyles } from "../lib/ui";
import { useToast } from "./ui/toast-provider";

type Props = {
  initialHouseholds: HouseholdSummary[];
};

export default function HouseholdDirectoryShell({ initialHouseholds }: Props) {
  const { showToast } = useToast();
  const [households, setHouseholds] = useState(initialHouseholds);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setLoading(true);
      const data = await createHousehold({ name: name.trim() });
      setHouseholds((current) => [data.household, ...current]);
      setName("");
      showToast({
        variant: "success",
        title: "Household created",
        description: "You can now invite members and share obligations."
      });
    } catch (error) {
      showToast({
        variant: "error",
        title: "Could not create household",
        description: error instanceof Error ? error.message : "Please try again."
      });
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

      <h1 style={{ marginTop: 0 }}>Households</h1>

      <section style={{ ...cardStyles.section, marginBottom: 14 }}>
        <form onSubmit={handleCreate} style={{ display: "grid", gap: 10 }}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Household name"
            style={inputStyles.input}
            required
          />
          <div>
            <button type="submit" disabled={loading} style={buttonStyles.primary}>
              {loading ? "Creating..." : "Create household"}
            </button>
          </div>
        </form>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        {households.map((household) => (
          <article key={household.id} style={cardStyles.item}>
            <div style={{ fontWeight: 700 }}>{household.name}</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
              {household.memberCount} members
            </div>
            <Link href={`/households/${household.id}`} style={buttonStyles.link}>
              Open household
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
