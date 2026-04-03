"use client";

import { useState } from "react";
import { buttonStyles } from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";

type TabKey = "overview" | "capture" | "reminders";

type Props = {
  overview: React.ReactNode;
  capture: React.ReactNode;
  reminders: React.ReactNode;
};

export default function DashboardTabs({ overview, capture, reminders }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const isMobile = useIsMobile();

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "capture", label: "Capture" },
    { key: "reminders", label: "Reminders" }
  ];

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 180px))",
          gap: 10,
          marginBottom: 20
        }}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                ...(active ? buttonStyles.primary : buttonStyles.secondary),
                width: "100%"
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: activeTab === "overview" ? "block" : "none" }}>
        {overview}
      </div>

      <div style={{ display: activeTab === "capture" ? "block" : "none" }}>
        {capture}
      </div>

      <div style={{ display: activeTab === "reminders" ? "block" : "none" }}>
        {reminders}
      </div>
    </div>
  );
}
