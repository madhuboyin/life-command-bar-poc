"use client";

import React from "react";

interface Props {
  recommendedType: string;
  onAction: (key: "KEEP" | "CANCEL" | "REMIND_LATER") => void;
  isSubmitting: boolean;
}

export function SubscriptionDecisionActions({ recommendedType, onAction, isSubmitting }: Props) {
  
  return (
    <div className="flex flex-col gap-3">
      {/* Primary Action is dynamically set based on recommendation Type */}
      {recommendedType === "CANCEL" || recommendedType === "DOWNGRADE" ? (
         <>
           <button 
             onClick={() => onAction("CANCEL")}
             disabled={isSubmitting}
             className="w-full py-4 px-6 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors focus:ring-4 focus:ring-red-600/30 outline-none disabled:opacity-50"
           >
             Cancel Subscription
           </button>
           <button 
             onClick={() => onAction("KEEP")}
             disabled={isSubmitting}
             className="w-full py-4 px-6 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium rounded-xl transition-colors focus:ring-4 focus:ring-zinc-500/30 outline-none disabled:opacity-50"
           >
             Actually, Keep It
           </button>
         </>
      ) : (
         <>
           <button 
             onClick={() => onAction("KEEP")}
             disabled={isSubmitting}
             className="w-full py-4 px-6 bg-black dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-100 font-medium rounded-xl transition-colors focus:ring-4 focus:ring-black/30 outline-none disabled:opacity-50"
           >
             Looks Good, Keep It
           </button>
           <button 
             onClick={() => onAction("CANCEL")}
             disabled={isSubmitting}
             className="w-full py-4 px-6 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 font-medium rounded-xl transition-colors focus:ring-4 focus:ring-red-500/30 outline-none disabled:opacity-50"
           >
             Cancel Subscription
           </button>
         </>
      )}

      <button 
        onClick={() => onAction("REMIND_LATER")}
        disabled={isSubmitting}
        className="w-full py-4 px-6 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-500 dark:text-zinc-400 font-medium rounded-xl transition-colors focus:ring-4 focus:ring-zinc-500/30 outline-none disabled:opacity-50"
      >
        I need more time to decide
      </button>
    </div>
  );
}
