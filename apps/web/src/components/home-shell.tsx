"use client";

import { useState } from "react";
import type { TodayFeedItem, TodayFeedResponse } from "../lib/types";
import AddObligationForm from "./add-obligation-form";
import CommandBar from "./command-bar";
import TodayFeedClient from "./today-feed-client";
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
      <TodayFeedClient initialData={initialData} externalItems={externalItems} />
    </>
  );
}
