"use client";

import React from "react";
import { SubscriptionReviewHubData } from "../../../lib/types";
import { SubscriptionReviewCard } from "./subscription-review-card";

export function SubscriptionReviewHubShell({ data }: { data: SubscriptionReviewHubData }) {
  if (data.summary.totalReviewItems === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-8 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-锌-100">All Caught Up!</h1>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-md">
              There are no subscriptions that urgently need your review right now.
            </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-12">
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Subscription Review Hub</h1>
        <p className="text-lg text-zinc-500 dark:text-zinc-400 max-w-2xl">
          You have {data.summary.totalReviewItems} items across your subscriptions that need attention. We grouped them so you can handle them fast.
        </p>
      </header>

      <div className="space-y-16">
        {data.groups.map(group => (
          <section key={group.key} className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-xl font-medium tracking-tight flex items-center gap-2">
                {group.title}
                <span className="bg-zinc-100 dark:bg-zinc-800 text-sm py-0.5 px-2 rounded-full text-zinc-600 dark:text-zinc-300">
                  {group.items.length}
                </span>
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400">{group.description}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.items.map(item => (
                <SubscriptionReviewCard key={item.subscriptionId} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
