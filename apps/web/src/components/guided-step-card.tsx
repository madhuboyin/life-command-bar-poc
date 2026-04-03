import type { GuidedJourneyStep } from "../lib/types";
import { cardStyles, colors, text } from "../lib/ui";
import GuidedOptionList from "./guided-option-list";

type Props = {
  step: GuidedJourneyStep;
  loading?: boolean;
  onSelectOption: (optionKey: string) => void;
};

export default function GuidedStepCard({
  step,
  loading = false,
  onSelectOption
}: Props) {
  return (
    <section style={cardStyles.section}>
      <div style={text.label}>Current Step</div>
      <h2 style={{ margin: "0 0 8px 0", fontSize: 24 }}>{step.title}</h2>
      <p style={{ margin: "0 0 10px 0", color: colors.textMuted }}>{step.description}</p>

      <section style={{ ...cardStyles.bordered, marginBottom: 12 }}>
        <div style={text.label}>Why this matters</div>
        <div>{step.whyItMatters}</div>
      </section>

      {step.recommendedOption ? (
        <section style={{ ...cardStyles.bordered, marginBottom: 12 }}>
          <div style={text.label}>Recommendation</div>
          <div>
            {step.options.find((option) => option.key === step.recommendedOption)?.label ??
              step.recommendedOption}
          </div>
        </section>
      ) : null}

      <section style={{ ...cardStyles.bordered }}>
        <div style={text.label}>Choose an option</div>
        <GuidedOptionList step={step} disabled={loading} onSelect={onSelectOption} />
      </section>
    </section>
  );
}
