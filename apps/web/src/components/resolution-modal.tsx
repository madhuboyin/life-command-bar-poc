"use client";

import type { ResolutionResponse } from "../lib/types";
import { buttonStyles, cardStyles, colors, radius, shadow, text } from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";

type Props = {
  open: boolean;
  onClose: () => void;
  resolution: ResolutionResponse | null;
};

export default function ResolutionModal({ open, onClose, resolution }: Props) {
  const isMobile = useIsMobile();

  if (!open || !resolution) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={{
          ...modalStyle,
          maxWidth: isMobile ? "100%" : 760,
          maxHeight: isMobile ? "92vh" : "85vh",
          padding: isMobile ? 16 : 20
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "flex-start",
            flexDirection: isMobile ? "column" : "row",
            gap: 12,
            marginBottom: 20
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Resolution Guidance</h2>
            <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
              Flow: {resolution.recommendation.flowKey}
            </div>
          </div>

          <button onClick={onClose} style={buttonStyles.secondary}>
            Close
          </button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <section style={cardStyles.bordered}>
            <div style={text.label}>Why it matters</div>
            <div>{resolution.recommendation.whyItMatters}</div>
          </section>

          <section style={cardStyles.bordered}>
            <div style={text.label}>Recommendation</div>
            <div>{resolution.recommendation.recommendation}</div>
          </section>

          <section style={cardStyles.bordered}>
            <div style={text.label}>Decision options</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 10
              }}
            >
              {resolution.recommendation.decisionOptions.map((option) => (
                <div key={option.key} style={chipStyle}>
                  <strong>{option.label}</strong>
                  {option.description ? (
                    <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
                      {option.description}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section style={cardStyles.bordered}>
            <div style={text.label}>Steps</div>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {resolution.recommendation.steps.map((step, index) => (
                <li key={index} style={{ marginBottom: 8 }}>
                  {step}
                </li>
              ))}
            </ol>
          </section>

          <section style={cardStyles.bordered}>
            <div style={text.label}>Suggested actions</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(160px, max-content))",
                gap: 10
              }}
            >
              <div style={actionChipPrimary}>
                {resolution.recommendation.primaryAction.label}
              </div>

              {resolution.recommendation.secondaryActions.map((action) => (
                <div key={action.key} style={actionChipSecondary}>
                  {action.label}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50
};

const modalStyle: React.CSSProperties = {
  width: "100%",
  background: colors.surface,
  borderRadius: radius.xl,
  boxShadow: shadow.modal,
  overflowY: "auto"
};

const chipStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  borderRadius: radius.md,
  padding: "10px 12px",
  minWidth: 140
};

const actionChipBase: React.CSSProperties = {
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center"
};

const actionChipPrimary: React.CSSProperties = {
  ...actionChipBase,
  background: buttonStyles.primary.background,
  color: buttonStyles.primary.color
};

const actionChipSecondary: React.CSSProperties = {
  ...actionChipBase,
  border: buttonStyles.secondary.border,
  background: buttonStyles.secondary.background,
  color: buttonStyles.secondary.color
};
