"use client";

import { signOut } from "next-auth/react";
import type { GmailConnectionStatus, HouseholdSummary } from "../lib/types";
import { buttonStyles, cardStyles, colors, radius } from "../lib/ui";

export default function AccountSettingsPanel({
  user,
  gmailConnection,
  households
}: {
  user: {
    id: string;
    name: string | null;
    email: string;
    image?: string | null;
  };
  gmailConnection: GmailConnectionStatus | null;
  households: HouseholdSummary[];
}) {
  const householdCount = households.length;

  return (
    <section style={{ ...cardStyles.bordered, display: "grid", gap: 10, marginBottom: 16 }}>
      <h2 style={{ margin: 0 }}>Account</h2>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontWeight: 600 }}>{user.name || "Life Command Bar User"}</div>
        <div style={{ color: colors.textMuted }}>{user.email}</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Tag label={gmailConnection?.status === "ACTIVE" ? "Gmail connected" : "Gmail not connected"} />
        <Tag label={`Households ${householdCount}`} />
      </div>

      {householdCount > 0 ? (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 12, color: colors.textMuted }}>Member of</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {households.map((household) => (
              <Tag key={household.id} label={household.name} />
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/signin" })}
          style={buttonStyles.secondary}
        >
          Sign out
        </button>
      </div>
    </section>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span
      style={{
        borderRadius: radius.pill,
        border: `1px solid ${colors.border}`,
        padding: "4px 10px",
        fontSize: 12,
        color: colors.textMuted,
        background: colors.surface
      }}
    >
      {label}
    </span>
  );
}
