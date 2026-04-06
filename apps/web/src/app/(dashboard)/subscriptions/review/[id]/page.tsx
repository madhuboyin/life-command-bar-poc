"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getSubscriptionReviewFlow } from "../../../../../../lib/api";
import { SubscriptionDecisionFlowData } from "../../../../../../lib/types";
import { SubscriptionReviewFlowShell } from "../../../../../../components/subscription-review/subscription-review-flow-shell";

export default function SubscriptionDecisionPage() {
  const { id } = useParams() as { id: string };
  const [data, setData] = useState<SubscriptionDecisionFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) return;
    getSubscriptionReviewFlow(id)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-zinc-500 animate-pulse">Loading review flow...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">Failed to load review flow.</div>;
  }

  if (!data) return null;

  return <SubscriptionReviewFlowShell data={data} subscriptionId={id} />;
}
