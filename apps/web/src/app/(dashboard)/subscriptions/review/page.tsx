"use client";

import React, { useEffect, useState } from "react";
import { getSubscriptionReviewHub } from "@/lib/api";
import { SubscriptionReviewHubData } from "@/lib/types";
import { SubscriptionReviewHubShell } from "@/components/subscription-review/subscription-review-hub-shell";

export default function SubscriptionReviewPage() {
  const [data, setData] = useState<SubscriptionReviewHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    getSubscriptionReviewHub()
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-zinc-500 animate-pulse">Loading review hub...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">Failed to load review hub.</div>;
  }

  if (!data) return null;

  return <SubscriptionReviewHubShell data={data} />;
}
