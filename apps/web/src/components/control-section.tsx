"use client";

import { useState } from "react";
import { cardStyles, colors } from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";

type Props = {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
  defaultCollapsedOnMobile?: boolean;
};

export default function ControlSection({
  title,
  description,
  count,
  children,
  defaultCollapsedOnMobile = false
}: Props) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(defaultCollapsedOnMobile);
  const isCollapsed = isMobile ? collapsed : false;

  return (
    <section style={cardStyles.section}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 10,
          flexWrap: "wrap"
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
          <div style={{ color: colors.textMuted, fontSize: 14 }}>{description}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              borderRadius: 999,
              background: "#e5e7eb",
              color: "#374151",
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 700
            }}
          >
            {count}
          </span>
          {isMobile ? (
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              style={{
                border: "1px solid #d1d5db",
                background: "#ffffff",
                color: "#111827",
                borderRadius: 8,
                padding: "6px 10px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              {isCollapsed ? "Show" : "Hide"}
            </button>
          ) : null}
        </div>
      </div>
      {!isCollapsed ? children : null}
    </section>
  );
}
