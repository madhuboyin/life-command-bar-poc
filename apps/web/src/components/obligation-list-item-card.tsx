"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createOrResumeGuidedJourney } from "../lib/api";
import { buildGuidedHref } from "../lib/flow-navigation";
import type { FlowSourceType, Obligation } from "../lib/types";
import { buttonStyles, cardStyles, colors, formatDateTime } from "../lib/ui";
import { useFlowSession } from "./flow-session-provider";
import { useToast } from "./ui/toast-provider";
import SourceBadge from "./source-badge";
import ConfidenceBadge from "./confidence-badge";
import AssigneeBadge from "./assignee-badge";
import AssignmentMenu from "./assignment-menu";
import ClaimItemButton from "./claim-item-button";

type Props = {
  item: Obligation;
  flowSourceType?: FlowSourceType;
  flowLabel?: string;
  flowReturnPath?: string;
  flowObligationIds?: string[];
};

export default function ObligationListItemCard({
  item,
  flowSourceType = "DASHBOARD",
  flowLabel = "Filtered obligations",
  flowReturnPath = "/obligations",
  flowObligationIds = [item.id]
}: Props) {
  const [startingGuide, setStartingGuide] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();
  const flow = useFlowSession();

  async function handleGuideMe() {
    try {
      setStartingGuide(true);
      const data = await createOrResumeGuidedJourney(item.id);
      const session = await flow.startSession({
        sourceType: flowSourceType,
        sourceContext: {
          label: flowLabel,
          returnPath: flowReturnPath,
          obligationIds: flowObligationIds
        },
        currentObligationId: item.id,
        currentJourneyId: data.journey.id
      });

      router.push(buildGuidedHref(data.journey.id, session.id));
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <SourceBadge sourceType={item.sourceType} />
          <ConfidenceBadge
            confidenceBand={item.confidenceBand}
            needsReview={item.needsReview}
          />
          <AssigneeBadge obligation={item} compact />
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
        {item.scopeType === "HOUSEHOLD" ? (
          <AssignmentMenu obligation={item} />
        ) : null}
        {item.scopeType === "HOUSEHOLD" && !item.assignedToUserId ? (
          <ClaimItemButton obligationId={item.id} />
        ) : null}
        {item.status === "DRAFT" && item.source !== "MANUAL" ? (
          <Link href={`/obligations/${item.id}/review`} style={buttonStyles.link}>
            Review draft
          </Link>
        ) : null}
        <Link href={`/obligations/${item.id}`} style={buttonStyles.link}>
          View details
        </Link>
      </div>
    </article>
  );
}
