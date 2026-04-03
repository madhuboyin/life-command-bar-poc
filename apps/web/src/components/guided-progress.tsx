import { colors, radius } from "../lib/ui";

type Props = {
  currentStepIndex: number;
  totalSteps: number;
  progressPercent: number;
};

export default function GuidedProgress({
  currentStepIndex,
  totalSteps,
  progressPercent
}: Props) {
  const safeTotal = Math.max(1, totalSteps);
  const safeIndex = Math.min(Math.max(currentStepIndex, 0), safeTotal - 1);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 13, color: colors.textMuted }}>
        Step {safeIndex + 1} of {safeTotal}
      </div>
      <div
        style={{
          width: "100%",
          height: 10,
          borderRadius: radius.pill,
          background: "#e5e7eb",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(0, progressPercent))}%`,
            height: "100%",
            background: "#111827",
            transition: "width 180ms ease"
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: colors.textMuted }}>{progressPercent}% complete</div>
    </div>
  );
}
