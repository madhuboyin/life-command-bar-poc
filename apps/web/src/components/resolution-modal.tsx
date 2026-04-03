"use client";

import type { ResolutionResponse } from "../lib/types";
import { buttonStyles, cardStyles, colors, radius, shadow, text } from "../lib/ui";

type Props = {
  open: boolean;
  onClose: () => void;
  resolution: ResolutionResponse | null;
};

export default function ResolutionModal({ open, onClose, resolution }: Props) {
  if (!open || !resolution) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
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
            <div style={text.label}>Primary action</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={buttonStyles.primary}>
                {resolution.recommendation.primaryAction.label}
              </button>

              {resolution.recommendation.secondaryActions.map((action) => (
                <button key={action.key} style={buttonStyles.secondary}>
                  {action.label}
                </button>
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
  padding: 24,
  zIndex: 50
};

const modalStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 760,
  maxHeight: "85vh",
  overflowY: "auto",
  background: colors.surface,
  borderRadius: radius.xl,
  padding: 20,
  boxShadow: shadow.modal
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20
};

const chipStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  borderRadius: radius.md,
  padding: "10px 12px",
  minWidth: 140
};
