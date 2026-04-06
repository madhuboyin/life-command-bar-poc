"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { SubscriptionDecisionFlowData } from "../../../lib/types";
import { applySubscriptionReviewAction } from "../../../lib/api";
import { SubscriptionDecisionActions } from "./subscription-decision-actions";

export function SubscriptionReviewFlowShell({ data, subscriptionId }: { data: SubscriptionDecisionFlowData, subscriptionId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  async function handleAction(actionKey: "KEEP" | "CANCEL" | "REMIND_LATER") {
    setIsSubmitting(true);
    try {
      if (actionKey === "CANCEL") {
        // Here we could either do the handoff to Guided Mode or transition local state and route away.
        await applySubscriptionReviewAction(subscriptionId, { action: "CANCEL" });
        // Suppose there's a Guided Mode page: router.push(`/guided-flow/${subscriptionId}`);
        // For now, we return to the hub.
        router.push("/subscriptions/review");
      } else {
        await applySubscriptionReviewAction(subscriptionId, { action: actionKey });
        router.push("/subscriptions/review"); // Return to hub to process the next one
      }
    } catch (err) {
      console.error("Action error", err);
      // in real app use toast
    } finally {
      setIsSubmitting(false);
    }
  }

  const { subscription, recommendation, decisionContext } = data;

  return (
    <div className="max-w-xl mx-auto p-4 md:p-8 space-y-8 min-h-[70vh] flex flex-col justify-center">
      
      <div className="text-center space-y-2 pb-6 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-sm font-medium tracking-wide text-zinc-500 uppercase">{decisionContext.whatChanged}</p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {subscription.title}
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
            {subscription.recurringPrice 
                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: subscription.currency ?? 'USD' }).format(subscription.recurringPrice)
                : "Checking price..."}
            <span className="text-sm text-zinc-400"> / {subscription.planName ?? "unknown plan"}</span>
        </p>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-900/50 p-6 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 space-y-4">
        <div className="flex items-start gap-4">
            <div className="h-8 w-8 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                i
            </div>
            <div className="space-y-1">
                <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                  {recommendation.reason}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {decisionContext.sourceSummary} 
                  {subscription.nextRenewalDate && ` • Renews ${new Date(subscription.nextRenewalDate).toLocaleDateString()}`}
                </p>
            </div>
        </div>
      </div>

      <SubscriptionDecisionActions 
        recommendedType={recommendation.type} 
        onAction={handleAction} 
        isSubmitting={isSubmitting} 
      />

      <div className="pt-6 text-center">
        <button 
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors"
        >
            {showDetails ? "Hide Details" : "Review details before deciding"}
        </button>
      </div>

      {showDetails && (
          <div className="pt-8 space-y-6 animate-in slide-in-from-bottom-2 fade-in duration-300 border-t border-zinc-100 dark:border-zinc-800">
              <h3 className="font-medium text-lg">Trust & Evidence</h3>
              <ul className="space-y-4">
                  {data.detailSections.evidenceSummary.map((ev, i) => (
                      <li key={i} className="flex gap-4 items-start">
                          <span className="text-zinc-300 dark:text-zinc-700">•</span>
                          <div>
                              <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{ev.title}</p>
                              <p className="text-sm text-zinc-500">{ev.desc}</p>
                          </div>
                      </li>
                  ))}
                  {data.detailSections.evidenceSummary.length === 0 && (
                      <p className="text-sm text-zinc-500">No additional deep evidence available.</p>
                  )}
              </ul>
          </div>
      )}
    </div>
  );
}
