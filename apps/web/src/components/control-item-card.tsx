"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  approveZeroInputAction,
  acceptAutoFlow,
  confirmObligationCandidate,
  confirmPrediction,
  createOrResumeFlowSession,
  createOrResumeGuidedJourney,
  dismissAutoFlow,
  dismissObligation,
  dismissPrediction,
  rejectZeroInputAction,
  rejectObligationCandidate
} from "../lib/api";
import { buildGuidedHref } from "../lib/flow-navigation";
import type {
  ControlTowerApprovalItem,
  ControlTowerReadyItem,
  ControlTowerRecentItem,
  ControlTowerReviewItem,
  ControlTowerSystemDecisionItem,
  ControlTowerUpcomingItem
} from "../lib/types";
import { buttonStyles, cardStyles, colors, radius } from "../lib/ui";
import {
  buildActionLabel,
  buildRecommendationMessage
} from "../lib/human-language.service";
import {
  buildActionAftercareMessage,
  buildDecisionConfidenceMessage,
  buildPrimaryReassurance
} from "../lib/emotional-trust.service";
import ConfidenceBadge from "./confidence-badge";
import ReassuranceInline from "./reassurance-inline";
import WhyThisExplanation from "./why-this-explanation";
import WhyThisToggle from "./why-this-toggle";
import { useToast } from "./ui/toast-provider";

type CommonProps = {
  onUpdated: () => Promise<void>;
};

type Props =
  | (CommonProps & { section: "review"; item: ControlTowerReviewItem })
  | (CommonProps & { section: "approvals"; item: ControlTowerApprovalItem })
  | (CommonProps & { section: "ready"; item: ControlTowerReadyItem })
  | (CommonProps & { section: "upcoming"; item: ControlTowerUpcomingItem })
  | (CommonProps & { section: "recent"; item: ControlTowerRecentItem })
  | (CommonProps & { section: "systemDecisions"; item: ControlTowerSystemDecisionItem });

export default function ControlItemCard(props: Props) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  const dateLabel = useMemo(() => {
    if (props.section === "review") {
      return toDateLabel(props.item.predictedDate);
    }

    if (props.section === "approvals") {
      return toDateLabel(props.item.createdAt);
    }

    if (props.section === "upcoming") {
      return toDateLabel(props.item.predictedDate);
    }

    if (props.section === "recent") {
      return toDateLabel(props.item.createdAt);
    }

    if (props.section === "systemDecisions") {
      return toDateLabel(props.item.createdAt);
    }

    return null;
  }, [props]);

  async function runAction(
    action: string,
    handler: () => Promise<void>,
    successTitle?: string,
    successDescription?: string
  ) {
    try {
      setLoadingAction(action);
      setError(null);
      await handler();
      if (successTitle) {
        showToast({
          variant: "success",
          title: successTitle,
          description: successDescription
        });
      }
      await props.onUpdated();
    } catch (actionError) {
      const message =
        actionError instanceof Error ? actionError.message : "Could not complete action";
      setError(message);
      showToast({ variant: "error", title: "Action failed", description: message });
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleStartReady() {
    if (props.section !== "ready") return;

    try {
      setLoadingAction("start");
      setError(null);

      if (props.item.autoFlowId) {
        await acceptAutoFlow(props.item.autoFlowId);
      }

      const journey = await createOrResumeGuidedJourney(props.item.obligationId);
      const session = await createOrResumeFlowSession({
        sourceType: props.item.autoFlowId ? "AUTO_FLOW" : "DASHBOARD",
        sourceContext: {
          label: "Control Tower",
          returnPath: "/control-tower",
          obligationIds: [props.item.obligationId]
        },
        currentObligationId: props.item.obligationId,
        currentJourneyId: journey.journey.id
      });

      showToast({
        variant: "success",
        title: "Opening guided flow",
        description: props.item.title
      });

      router.push(buildGuidedHref(journey.journey.id, session.session.id));
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Could not open guided flow";
      setError(message);
      showToast({ variant: "error", title: "Start failed", description: message });
    } finally {
      setLoadingAction(null);
    }
  }

  if (props.section === "review") {
    const extracted = formatExtractedFields(props.item.extractedFields);
    const reviewMessage = buildRecommendationMessage({
      recommendationType: "REVIEW",
      issue: props.item.reviewReasons[0] ?? null,
      reason: props.item.reviewReasons[0] ?? null
    });
    const confidenceMessage = buildDecisionConfidenceMessage({
      confidenceBand: props.item.confidenceBand,
      actionType: "REVIEW"
    });
    const reassurance = buildPrimaryReassurance({
      confidenceBand: props.item.confidenceBand,
      needsReview: true,
      actionType: "REVIEW",
      priorityBand: props.item.priorityBand
    });

    return (
      <article style={{ ...cardStyles.item, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: "0 0 6px 0" }}>{props.item.title}</h3>
            <div style={{ color: colors.textMuted, fontSize: 13 }}>{reviewMessage.primary}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <SourceLabelBadge label={props.item.sourceLabel} />
            <ConfidenceBadge
              confidenceBand={props.item.confidenceBand}
              needsReview={props.item.confidenceBand !== "HIGH"}
            />
          </div>
        </div>

        {props.item.description ? (
          <p style={{ margin: 0, color: colors.textMuted }}>{props.item.description}</p>
        ) : null}

        {dateLabel ? (
          <div style={{ fontSize: 13, color: colors.textMuted }}>Expected around {dateLabel}</div>
        ) : null}

        <ReassuranceInline
          compact
          message={{
            ...confidenceMessage,
            primary: reviewMessage.primary,
            supporting: reviewMessage.context ?? reassurance.supporting
          }}
        />

        {extracted.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {extracted.slice(0, 6).map((field) => (
              <span
                key={`${props.item.id}_${field.key}`}
                style={{
                  borderRadius: radius.pill,
                  border: `1px solid ${colors.border}`,
                  padding: "4px 10px",
                  fontSize: 12,
                  color: colors.textMuted,
                  background: colors.surface
                }}
              >
                {field.key}: {field.value}
              </span>
            ))}
          </div>
        ) : null}

        <WhyThisExplanation why={props.item.why} />

        {error ? <div style={{ color: colors.errorText, fontSize: 12 }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {props.item.itemType === "OBLIGATION" && props.item.obligationId ? (
            <>
              <button
                type="button"
                onClick={() =>
                  void runAction(
                    "confirm",
                    async () => {
                      await confirmObligationCandidate(props.item.obligationId as string, {
                        status: "ACTIVE"
                      });
                    },
                    buildActionAftercareMessage({ actionType: "REVIEW", trackAction: true }).primary,
                    props.item.title
                  )
                }
                disabled={loadingAction !== null}
                style={buttonStyles.primary}
              >
                {loadingAction === "confirm" ? "Saving..." : buildActionLabel("confirm")}
              </button>
              <Link href={`/obligations/${props.item.obligationId}/review`} style={buttonStyles.link}>
                {buildActionLabel("review")}
              </Link>
              <button
                type="button"
                onClick={() =>
                  void runAction(
                    "reject",
                    async () => {
                      await rejectObligationCandidate(
                        props.item.obligationId as string,
                        "Rejected from control tower"
                      );
                    },
                    buildActionAftercareMessage({ actionType: "IGNORE", trackAction: true }).primary,
                    props.item.title
                  )
                }
                disabled={loadingAction !== null}
                style={buttonStyles.danger}
              >
                {loadingAction === "reject" ? "Saving..." : buildActionLabel("ignore")}
              </button>
            </>
          ) : props.item.predictionId ? (
            <>
              <button
                type="button"
                onClick={() =>
                  void runAction(
                    "confirm",
                    async () => {
                      await confirmPrediction(props.item.predictionId as string, false);
                    },
                    buildActionAftercareMessage({ actionType: "CONFIRM", trackAction: true }).primary,
                    props.item.title
                  )
                }
                disabled={loadingAction !== null}
                style={buttonStyles.primary}
              >
                {loadingAction === "confirm" ? "Saving..." : buildActionLabel("confirm")}
              </button>
              <Link href="/upcoming" style={buttonStyles.link}>
                {buildActionLabel("details")}
              </Link>
              <button
                type="button"
                onClick={() =>
                  void runAction(
                    "dismiss",
                    async () => {
                      await dismissPrediction(
                        props.item.predictionId as string,
                        "dismissed_from_control_tower_review"
                      );
                    },
                    buildActionAftercareMessage({ actionType: "IGNORE", trackAction: true }).primary,
                    props.item.title
                  )
                }
                disabled={loadingAction !== null}
                style={buttonStyles.danger}
              >
                {loadingAction === "dismiss" ? "Saving..." : buildActionLabel("ignore")}
              </button>
            </>
          ) : null}
        </div>
      </article>
    );
  }

  if (props.section === "approvals") {
    const actionLabel = humanizeAction(props.item.candidateAction);

    return (
      <article style={{ ...cardStyles.item, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: "0 0 6px 0" }}>{props.item.title}</h3>
            <div style={{ color: colors.textMuted, fontSize: 13 }}>
              {props.item.rationaleSummary ?? "Quick check needed before this runs."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <SourceLabelBadge label={props.item.sourceLabel} />
            <ConfidenceBadge confidenceBand={props.item.confidenceBand} needsReview />
          </div>
        </div>

        {props.item.description ? (
          <p style={{ margin: 0, color: colors.textMuted }}>{props.item.description}</p>
        ) : null}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Tag label={actionLabel} />
          <Tag label={props.item.status.toLowerCase().replace(/_/g, " ")} />
          {dateLabel ? <Tag label={`Queued ${dateLabel}`} /> : null}
        </div>

        <WhyThisExplanation why={props.item.why} />

        {error ? <div style={{ color: colors.errorText, fontSize: 12 }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() =>
              void runAction(
                "approve",
                async () => {
                  await approveZeroInputAction(props.item.decisionId);
                },
                buildActionAftercareMessage({ actionType: "CONFIRM", trackAction: true }).primary,
                props.item.title
              )
            }
            disabled={loadingAction !== null}
            style={buttonStyles.primary}
          >
            {loadingAction === "approve" ? "Saving..." : buildActionLabel("confirm")}
          </button>
          {props.item.obligationId ? (
            <Link href={`/obligations/${props.item.obligationId}/review`} style={buttonStyles.link}>
              Edit
            </Link>
          ) : props.item.predictionId ? (
            <Link href="/upcoming" style={buttonStyles.link}>
              Inspect
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() =>
              void runAction(
                "reject",
                async () => {
                  await rejectZeroInputAction(props.item.decisionId, {
                    reason: "rejected_from_control_tower"
                  });
                },
                buildActionAftercareMessage({ actionType: "IGNORE", trackAction: true }).primary,
                props.item.title
              )
            }
            disabled={loadingAction !== null}
            style={buttonStyles.danger}
          >
            {loadingAction === "reject" ? "Saving..." : buildActionLabel("ignore")}
          </button>
        </div>
      </article>
    );
  }

  if (props.section === "ready") {
    return (
      <article style={{ ...cardStyles.item, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>{props.item.title}</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <SourceLabelBadge label={props.item.sourceLabel} />
            <ConfidenceBadge confidenceBand={props.item.confidenceBand} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Tag label={props.item.reason} />
          {props.item.autoFlowId ? <Tag label="Auto-flow" /> : <Tag label="Ready now" />}
        </div>

        <WhyThisExplanation why={props.item.why} />

        {error ? <div style={{ color: colors.errorText, fontSize: 12 }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void handleStartReady()}
            disabled={loadingAction !== null}
            style={buttonStyles.primary}
          >
            {loadingAction === "start" ? "Preparing..." : buildActionLabel(props.item.ctaLabel || "start")}
          </button>
          <Link href={`/obligations/${props.item.obligationId}`} style={buttonStyles.link}>
            {buildActionLabel("details")}
          </Link>
          <button
            type="button"
            onClick={() =>
              void runAction(
                "dismiss",
                async () => {
                  if (props.item.autoFlowId) {
                    await dismissAutoFlow(props.item.autoFlowId, "dismissed_from_control_tower_ready");
                    return;
                  }
                  await dismissObligation(
                    props.item.obligationId,
                    "dismissed_from_control_tower_ready"
                  );
                },
                buildActionAftercareMessage({ actionType: "IGNORE", trackAction: true }).primary,
                props.item.title
              )
            }
            disabled={loadingAction !== null}
            style={buttonStyles.secondary}
          >
            {loadingAction === "dismiss" ? "Saving..." : buildActionLabel("ignore")}
          </button>
        </div>
      </article>
    );
  }

  if (props.section === "upcoming") {
    return (
      <article style={{ ...cardStyles.item, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: "0 0 6px 0" }}>{props.item.title}</h3>
            <div style={{ color: colors.textMuted, fontSize: 13 }}>
              {props.item.rationaleSummary ?? "Nothing urgent yet. This may matter later."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <SourceLabelBadge label={props.item.sourceLabel} />
            <ConfidenceBadge
              confidenceBand={props.item.confidenceBand}
              needsReview={props.item.confidenceBand !== "HIGH"}
            />
          </div>
        </div>

        {props.item.description ? (
          <p style={{ margin: 0, color: colors.textMuted }}>{props.item.description}</p>
        ) : null}

        {dateLabel ? (
          <div style={{ fontSize: 13, color: colors.textMuted }}>Predicted around {dateLabel}</div>
        ) : null}

        <WhyThisExplanation why={props.item.why} />

        {error ? <div style={{ color: colors.errorText, fontSize: 12 }}>{error}</div> : null}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() =>
              void runAction(
                "confirm",
                async () => {
                  await confirmPrediction(props.item.predictionId, false);
                },
                buildActionAftercareMessage({ actionType: "CONFIRM", trackAction: true }).primary,
                props.item.title
              )
            }
            disabled={loadingAction !== null}
            style={buttonStyles.secondary}
          >
            {loadingAction === "confirm" ? "Saving..." : buildActionLabel("confirm")}
          </button>
          <button
            type="button"
            onClick={() =>
              void runAction(
                "dismiss",
                async () => {
                  await dismissPrediction(props.item.predictionId, "dismissed_from_control_tower_upcoming");
                },
                buildActionAftercareMessage({ actionType: "IGNORE", trackAction: true }).primary,
                props.item.title
              )
            }
            disabled={loadingAction !== null}
            style={buttonStyles.danger}
          >
            {loadingAction === "dismiss" ? "Saving..." : buildActionLabel("ignore")}
          </button>
          <Link
            href={props.item.obligationId ? `/obligations/${props.item.obligationId}` : "/upcoming"}
            style={buttonStyles.link}
          >
            {buildActionLabel("details")}
          </Link>
        </div>
      </article>
    );
  }

  if (props.section === "recent") {
    return (
      <article style={{ ...cardStyles.item, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>{props.item.title}</h3>
          <Tag label={props.item.outcomeLabel} />
        </div>
        <div style={{ color: colors.textMuted }}>{props.item.description}</div>
        <div style={{ fontSize: 12, color: colors.textMuted }}>
          {props.item.sourceLabel}
          {dateLabel ? ` · ${dateLabel}` : ""}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {props.item.obligationId ? (
            <Link href={`/obligations/${props.item.obligationId}`} style={buttonStyles.link}>
              View item
            </Link>
          ) : (
            <Link href="/obligations" style={buttonStyles.link}>
              Open obligations
            </Link>
          )}
        </div>
      </article>
    );
  }

  return (
    <article style={{ ...cardStyles.item, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>{props.item.title}</h3>
        <Tag label={props.item.decisionType} />
      </div>
      <div style={{ color: colors.textMuted }}>{props.item.explanation}</div>
      <WhyThisToggle metricKey="control_tower_system_decision_why">
        <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {props.item.sourceSignals.length > 0 ? (
            props.item.sourceSignals.map((signal) => (
              <Tag key={`${props.item.id}_${signal}`} label={signal.replace(/_/g, " ")} />
            ))
          ) : (
            <span style={{ color: colors.textMuted, fontSize: 13 }}>No extra details yet.</span>
          )}
        </div>
      </WhyThisToggle>
      <div style={{ fontSize: 12, color: colors.textMuted }}>
        {dateLabel ? `Recorded ${dateLabel}` : "Recorded recently"}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {(props.item.decisionType === "DUPLICATE" || props.item.decisionType === "ROUTING") && (
          <Link href="/review" style={buttonStyles.link}>
            Open review
          </Link>
        )}
        {props.item.obligationId ? (
          <Link href={`/obligations/${props.item.obligationId}`} style={buttonStyles.link}>
            View obligation
          </Link>
        ) : (
          <Link href="/upcoming" style={buttonStyles.link}>
            Open upcoming
          </Link>
        )}
      </div>
    </article>
  );
}

function toDateLabel(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatExtractedFields(value: Record<string, unknown> | null) {
  if (!value) return [] as Array<{ key: string; value: string }>;

  return Object.entries(value)
    .filter(([key]) => !isInternalFieldKey(key))
    .filter(([, raw]) => raw !== null && raw !== undefined && raw !== "")
    .map(([key, raw]) => ({
      key: humanizeFieldKey(key),
      value: formatFieldValue(raw)
    }))
    .filter((field) => field.value.length > 0);
}

function formatFieldValue(value: unknown): string {
  if (typeof value === "string") return value.replace(/_/g, " ").toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((entry) => formatFieldValue(entry)).join(", ");
  if (value && typeof value === "object") return "structured";
  return "";
}

function isInternalFieldKey(value: string) {
  return (
    value === "obligationCategory" ||
    value === "priorityBand" ||
    value === "surfacingTarget"
  );
}

function humanizeFieldKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

function humanizeAction(action: string) {
  switch (action) {
    case "CREATE_DRAFT_FROM_INGESTION":
      return "Promote ingested item";
    case "PROMOTE_RECURRING_PREDICTION":
      return "Promote recurring prediction";
    case "AUTO_CREATE_REMINDER":
      return "Create reminder";
    case "PREPARE_AUTO_FLOW":
      return "Prepare auto-flow";
    case "SUPPRESS_DUPLICATE":
      return "Suppress duplicate";
    case "AUTO_REFRESH_SURFACES":
      return "Refresh surfaces";
    default:
      return action.replace(/_/g, " ").toLowerCase();
  }
}

function Tag({ label }: { label: string }) {
  return (
    <span
      style={{
        borderRadius: radius.pill,
        border: `1px solid ${colors.border}`,
        padding: "4px 10px",
        fontSize: 12,
        color: colors.textMuted,
        background: colors.surface
      }}
    >
      {label}
    </span>
  );
}

function SourceLabelBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: radius.pill,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 600,
        background: "#eef2ff",
        color: "#3730a3"
      }}
    >
      {label}
    </span>
  );
}
