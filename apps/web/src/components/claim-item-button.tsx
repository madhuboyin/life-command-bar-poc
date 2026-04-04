"use client";

import { useState } from "react";
import { claimObligation } from "../lib/api";
import { buttonStyles } from "../lib/ui";
import { useToast } from "./ui/toast-provider";

type Props = {
  obligationId: string;
  onClaimed?: () => void;
};

export default function ClaimItemButton({ obligationId, onClaimed }: Props) {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  async function handleClaim() {
    try {
      setLoading(true);
      await claimObligation(obligationId);
      showToast({
        variant: "success",
        title: "Claimed",
        description: "This item is now assigned to you."
      });
      onClaimed?.();
    } catch (error) {
      showToast({
        variant: "error",
        title: "Could not claim item",
        description: error instanceof Error ? error.message : "Please try again."
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleClaim} disabled={loading} style={buttonStyles.secondary}>
      {loading ? "Claiming..." : "Claim"}
    </button>
  );
}
