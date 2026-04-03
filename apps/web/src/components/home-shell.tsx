"use client";

import { useState } from "react";
import type { TodayFeedItem, TodayFeedResponse } from "../lib/types";
import AddObligationForm from "./add-obligation-form";
import CommandBar from "./command-bar";
import TodayFeedClient from "./today-feed-client";
import UploadImportPanel from "./upload-import-panel";
import RemindersPanel from "./reminders-panel";
import { getTodayFeed } from "../lib/api";

type Props = {
  initialData: TodayFeedResponse;
};

export default function HomeShell({ initialData }: Props) {
  const [externalItems, setExternalItems] = useState<TodayFeedItem[] | null>(null);

  async function refreshFromServer() {
    const next = await getTodayFeed();
    setExternalItems(next.items);
  }

  return (
    <>
      <CommandBar onFeedReplace={(items) => setExternalItems(items)} />
      <AddObligationForm onCreated={refreshFromServer} />
      <UploadImportPanel onCompleted={refreshFromServer} />
      <RemindersPanel />
      <TodayFeedClient initialData={initialData} externalItems={externalItems} />
    </>
  );
}
