"use client";

import { useState } from "react";
import { claimObligation } from "../lib/api";
import { buttonStyles } from "../lib/ui";
import { buildActionAftercareMessage } from "../lib/emotional-trust.service";
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
      const message = buildActionAftercareMessage({ actionType: "CONFIRM", trackAction: true });
      showToast({
        variant: "success",
        title: message.primary,
        description: "This shared item is now assigned to you."
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
      {loading ? "Claiming..." : "Claim it"}
    </button>
  );
}
