import type { GuidedJourneyStep } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";

type Props = {
  step: GuidedJourneyStep;
  disabled?: boolean;
  onSelect: (optionKey: string) => void;
};

export default function GuidedOptionList({ step, disabled = false, onSelect }: Props) {
  const isMobile = useIsMobile();

  if (step.options.length === 0) {
    return (
      <div style={{ fontSize: 13, color: colors.textMuted }}>
        No options required for this step.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 10
      }}
    >
      {step.options.map((option) => {
        const selected = step.selectedOption === option.key;
        const recommended = step.recommendedOption === option.key;

        return (
          <button
            key={option.key}
            disabled={disabled}
            onClick={() => onSelect(option.key)}
            style={{
              ...cardStyles.item,
              textAlign: "left",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.7 : 1,
              borderColor: selected ? "#111827" : recommended ? "#60a5fa" : "#e5e7eb",
              background: selected ? "#f3f4f6" : cardStyles.item.background
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{option.label}</div>
            {option.description ? (
              <div style={{ fontSize: 12, color: colors.textMuted }}>{option.description}</div>
            ) : null}
            <div style={{ marginTop: 8, fontSize: 12, color: colors.textMuted }}>
              {selected ? "Selected" : recommended ? "Recommended" : "Tap to choose"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
