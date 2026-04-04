"use client";

import type { CSSProperties } from "react";
import type { Obligation } from "../lib/types";

type Props = {
  obligation: Pick<Obligation, "scopeType" | "assignedToUserId" | "assignee">;
  compact?: boolean;
};

export default function AssigneeBadge({ obligation, compact = false }: Props) {
  const baseStyle: CSSProperties = {
    borderRadius: 999,
    padding: compact ? "2px 8px" : "4px 10px",
    fontSize: compact ? 11 : 12,
    fontWeight: 700
  };

  if (obligation.scopeType !== "HOUSEHOLD") {
    return (
      <span style={{ ...baseStyle, background: "#eff6ff", color: "#1d4ed8" }}>
        Personal
      </span>
    );
  }

  if (!obligation.assignedToUserId) {
    return (
      <span style={{ ...baseStyle, background: "#f3f4f6", color: "#374151" }}>
        Shared
      </span>
    );
  }

  const name = obligation.assignee?.name ?? obligation.assignee?.email ?? "Member";
  return (
    <span style={{ ...baseStyle, background: "#ecfeff", color: "#0f766e" }}>
      Assigned to {name}
    </span>
  );
}
