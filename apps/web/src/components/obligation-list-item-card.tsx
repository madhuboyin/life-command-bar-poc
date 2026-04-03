"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createOrResumeGuidedJourney } from "../lib/api";
import type { Obligation } from "../lib/types";
import { buttonStyles, cardStyles, colors, formatDateTime } from "../lib/ui";
import { useToast } from "./ui/toast-provider";

type Props = {
  item: Obligation;
};

export default function ObligationListItemCard({ item }: Props) {
  const [startingGuide, setStartingGuide] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();

  async function handleGuideMe() {
    try {
      setStartingGuide(true);
      const data = await createOrResumeGuidedJourney(item.id);
      router.push(`/guided/${data.journey.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start Guided Mode";
      showToast({
        variant: "error",
        title: "Guided Mode failed",
        description: message
      });
    } finally {
      setStartingGuide(false);
    }
  }

  return (
    <article style={{ ...cardStyles.item, display: "grid", gap: 12 }}>
      <div>
        <h3 style={{ margin: "0 0 8px 0" }}>{item.title}</h3>
        <div style={{ color: colors.textMuted, fontSize: 14 }}>
          {item.type} · {item.status} · Due: {formatDateTime(item.dueDate)}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, max-content))",
          gap: 10
        }}
      >
        <button onClick={handleGuideMe} disabled={startingGuide} style={buttonStyles.secondary}>
          {startingGuide ? "Starting..." : "Guide me"}
        </button>
        <Link href={`/obligations/${item.id}`} style={buttonStyles.link}>
          View details
        </Link>
      </div>
    </article>
  );
}
