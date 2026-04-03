"use client";

import { useState } from "react";
import type { TodayFeedItem, TodayFeedResponse } from "../lib/types";
import AddObligationForm from "./add-obligation-form";
import CommandBar from "./command-bar";
import TodayFeedClient from "./today-feed-client";
import UploadImportPanel from "./upload-import-panel";
import RemindersPanel from "./reminders-panel";
import DashboardTabs from "./dashboard-tabs";
import DashboardSummaryStrip from "./dashboard-summary-strip";
import { getTodayFeed } from "../lib/api";

type Props = {
  initialData: TodayFeedResponse;
};

export default function HomeShell({ initialData }: Props) {
  const [externalItems, setExternalItems] = useState<TodayFeedItem[] | null>(null);
  const effectiveFeed: TodayFeedResponse = {
    generatedAt: initialData.generatedAt,
    items: externalItems ?? initialData.items
  };

  async function refreshFromServer() {
    const next = await getTodayFeed();
    setExternalItems(next.items);
  }

  const overview = (
    <div style={{ display: "grid", gap: 24 }}>
      <DashboardSummaryStrip data={effectiveFeed} />
      <TodayFeedClient initialData={initialData} externalItems={externalItems} />
    </div>
  );

  const capture = (
    <div style={{ display: "grid", gap: 24 }}>
      <CommandBar onFeedReplace={(items) => setExternalItems(items)} />
      <AddObligationForm onCreated={refreshFromServer} />
      <UploadImportPanel onCompleted={refreshFromServer} />
    </div>
  );

  const reminders = (
    <div style={{ display: "grid", gap: 24 }}>
      <RemindersPanel />
    </div>
  );

  return (
    <DashboardTabs
      overview={overview}
      capture={capture}
      reminders={reminders}
    />
  );
}
