"use client";

import Link from "next/link";
import { useState } from "react";
import {
  createHouseholdObligation,
  getHouseholdControlTower,
  getHouseholdObligations,
  getHouseholdPulse
} from "../lib/api";
import type {
  HouseholdControlTowerResponse,
  HouseholdPulseResponse,
  HouseholdSummary,
  Obligation
} from "../lib/types";
import { buttonStyles, cardStyles, colors, inputStyles, pageStyles } from "../lib/ui";
import AssignmentMenu from "./assignment-menu";
import AssigneeBadge from "./assignee-badge";
import ClaimItemButton from "./claim-item-button";
import { useToast } from "./ui/toast-provider";

type Props = {
  household: HouseholdSummary;
  initialPulse: HouseholdPulseResponse;
  initialControlTower: HouseholdControlTowerResponse;
  initialObligations: Obligation[];
};

export default function HouseholdOverviewShell({
  household,
  initialPulse,
  initialControlTower,
  initialObligations
}: Props) {
  const { showToast } = useToast();
  const [pulse, setPulse] = useState(initialPulse);
  const [controlTower, setControlTower] = useState(initialControlTower);
  const [obligations, setObligations] = useState(initialObligations);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    try {
      setLoading(true);
      const [nextPulse, nextControl, nextObligations] = await Promise.all([
        getHouseholdPulse(household.id),
        getHouseholdControlTower(household.id),
        getHouseholdObligations(household.id, { view: "household", limit: 50 })
      ]);
      setPulse(nextPulse);
      setControlTower(nextControl);
      setObligations(nextObligations.items);
    } finally {
      setLoading(false);
    }
  }

  async function createQuickObligation() {
    if (!newTitle.trim()) return;
    try {
      setCreating(true);
      await createHouseholdObligation(household.id, {
        type: "COMMITMENT",
        title: newTitle.trim(),
        source: "MANUAL",
        status: "ACTIVE"
      });
      setNewTitle("");
      await refresh();
      showToast({
        variant: "success",
        title: "Household item created",
        description: "Added to shared household obligations."
      });
    } catch (error) {
      showToast({
        variant: "error",
        title: "Could not create item",
        description: error instanceof Error ? error.message : "Please try again."
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to personal dashboard
        </Link>
      </div>

      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: "0 0 6px 0", fontSize: 34 }}>{household.name}</h1>
          <div style={{ color: colors.textMuted }}>
            Shared household workspace for ownership, delegation, and review.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href={`/households/${household.id}/members`} style={buttonStyles.link}>
            Members
          </Link>
          <Link href={`/households/${household.id}/control-tower`} style={buttonStyles.link}>
            Household Control Tower
          </Link>
          <button onClick={() => void refresh()} style={buttonStyles.secondary} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <section style={{ ...cardStyles.section, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>Household Pulse</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <Pill label={`Open ${pulse.summary.totalOpen}`} />
          <Pill label={`Assigned to me ${pulse.summary.assignedToMeCount}`} />
          <Pill label={`Unassigned ${pulse.summary.unassignedCount}`} />
          <Pill label={`Urgent ${pulse.summary.urgentCount}`} />
        </div>
        <div style={{ color: colors.textMuted, fontSize: 13 }}>
          Personal and shared contexts stay separate. This view only shows shared household obligations.
        </div>
      </section>

      <section style={{ ...cardStyles.section, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>Quick Capture</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 10 }}>
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Add a shared household obligation"
            style={inputStyles.input}
          />
          <button
            type="button"
            onClick={() => void createQuickObligation()}
            style={buttonStyles.primary}
            disabled={creating}
          >
            {creating ? "Adding..." : "Add shared item"}
          </button>
        </div>
      </section>

      <section style={{ display: "grid", gap: 10, marginBottom: 14 }}>
        {obligations.slice(0, 20).map((item) => (
          <article key={item.id} style={{ ...cardStyles.item, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: colors.textMuted }}>
                  {item.status} · {item.type} · {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "No due date"}
                </div>
              </div>
              <AssigneeBadge obligation={item} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <AssignmentMenu obligation={item} onUpdated={() => void refresh()} />
              {!item.assignedToUserId ? (
                <ClaimItemButton obligationId={item.id} onClaimed={() => void refresh()} />
              ) : null}
            </div>
          </article>
        ))}
      </section>

      <section style={{ ...cardStyles.section, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>Needs Review</div>
        <div style={{ display: "grid", gap: 8 }}>
          {controlTower.review.length === 0 ? (
            <div style={{ color: colors.textMuted }}>No review items right now.</div>
          ) : (
            controlTower.review.map((item) => (
              <div key={item.obligationId} style={cardStyles.item}>
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <div style={{ color: colors.textMuted, fontSize: 13 }}>{item.whyShown}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={cardStyles.section}>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>Upcoming</div>
        <div style={{ display: "grid", gap: 8 }}>
          {controlTower.upcoming.length === 0 ? (
            <div style={{ color: colors.textMuted }}>No upcoming household predictions yet.</div>
          ) : (
            controlTower.upcoming.map((item) => (
              <div key={item.id} style={cardStyles.item}>
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <div style={{ color: colors.textMuted, fontSize: 13 }}>
                  {item.predictedDate ? new Date(item.predictedDate).toLocaleDateString() : "Windowed prediction"} · {item.confidenceBand}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
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
