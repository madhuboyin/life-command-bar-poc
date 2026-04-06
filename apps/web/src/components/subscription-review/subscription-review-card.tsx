import React from "react";
import Link from "next/link";
import { SubscriptionReviewItem } from "@/lib/types";

export function SubscriptionReviewCard({ item }: { item: SubscriptionReviewItem }) {
  const isDark = "dark"; // Assuming you have standard dark mode utilities here

  return (
    <Link 
      href={`/subscriptions/review/${item.subscriptionId}`}
      className="group flex flex-col gap-3 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
    >
      <div className="flex justify-between items-start gap-4">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-black dark:group-hover:text-white transition-colors line-clamp-1">
            {item.title}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-[200px] truncate">
            {item.vendorName} {item.planName && `· ${item.planName}`}
          </p>
        </div>
        
        {item.recurringPrice != null && (
          <div className="text-right whitespace-nowrap">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency ?? 'USD' }).format(item.recurringPrice)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {item.primaryInsight && (
            <p className="text-sm text-zinc-600 dark:text-zinc-300 font-medium">
              ↳ {item.primaryInsight}
            </p>
        )}
        
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {item.nextRenewalDate ? `Renews on ${new Date(item.nextRenewalDate).toLocaleDateString()}` : "Renewal Date Unknown"}
          </p>
          <span className="text-sm font-medium text-blue-600 dark:text-blue-400 group-hover:underline underline-offset-2">
            Review →
          </span>
        </div>
      </div>
    </Link>
  );
}
