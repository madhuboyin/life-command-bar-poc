"use client";

import { useState } from "react";
import { buttonStyles } from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";

type TabKey = "overview" | "edit" | "history";

type Props = {
  overview: React.ReactNode;
  edit: React.ReactNode;
  history: React.ReactNode;
};

export default function ObligationDetailTabs({ overview, edit, history }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const isMobile = useIsMobile();

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "edit", label: "Edit" },
    { key: "history", label: "History" }
  ];

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 160px))",
          gap: 10,
          marginBottom: 18
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={activeTab === tab.key ? buttonStyles.primary : buttonStyles.secondary}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ display: activeTab === "overview" ? "block" : "none" }}>{overview}</div>
      <div style={{ display: activeTab === "edit" ? "block" : "none" }}>{edit}</div>
      <div style={{ display: activeTab === "history" ? "block" : "none" }}>{history}</div>
    </div>
  );
}
