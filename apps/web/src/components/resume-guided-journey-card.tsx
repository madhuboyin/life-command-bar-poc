import Link from "next/link";
import type { GuidedJourney } from "../lib/types";
import { buttonStyles, cardStyles, colors } from "../lib/ui";

type Props = {
  journey: GuidedJourney;
};

export default function ResumeGuidedJourneyCard({ journey }: Props) {
  return (
    <section style={cardStyles.bordered}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
        Guided Mode
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
        Resume your journey
      </div>
      <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 10 }}>
        Step {journey.currentStepIndex + 1} of {journey.totalSteps}
      </div>
      <div>
        <Link href={`/guided/${journey.id}`} style={buttonStyles.link}>
          Resume Guided Mode
        </Link>
      </div>
    </section>
  );
}
