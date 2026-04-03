"use client";

import type { ResolutionResponse } from "../lib/types";

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
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              Flow: {resolution.recommendation.flowKey}
            </div>
          </div>

          <button onClick={onClose} style={closeButton}>
            Close
          </button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <section style={sectionStyle}>
            <div style={labelStyle}>Why it matters</div>
            <div>{resolution.recommendation.whyItMatters}</div>
          </section>

          <section style={sectionStyle}>
            <div style={labelStyle}>Recommendation</div>
            <div>{resolution.recommendation.recommendation}</div>
          </section>

          <section style={sectionStyle}>
            <div style={labelStyle}>Decision options</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {resolution.recommendation.decisionOptions.map((option) => (
                <div key={option.key} style={chipStyle}>
                  <strong>{option.label}</strong>
                  {option.description && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                      {option.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={labelStyle}>Steps</div>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {resolution.recommendation.steps.map((step, index) => (
                <li key={index} style={{ marginBottom: 8 }}>
                  {step}
                </li>
              ))}
            </ol>
          </section>

          <section style={sectionStyle}>
            <div style={labelStyle}>Primary action</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={primaryButton}>
                {resolution.recommendation.primaryAction.label}
              </button>

              {resolution.recommendation.secondaryActions.map((action) => (
                <button key={action.key} style={secondaryButton}>
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
  background: "#fff",
  borderRadius: 18,
  padding: 20,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)"
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20
};

const closeButton: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
  background: "#fafafa"
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  marginBottom: 8
};

const chipStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 12,
  padding: "10px 12px",
  minWidth: 140
};

const primaryButton: React.CSSProperties = {
  border: "none",
  background: "#111827",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer"
};
