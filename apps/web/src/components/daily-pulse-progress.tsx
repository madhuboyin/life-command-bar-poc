import type { DailyPulseProgress } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";

type Props = {
  progress: DailyPulseProgress;
};

export default function DailyPulseProgress({ progress }: Props) {
  const handledCount =
    progress.completedCount + progress.postponedCount + progress.dismissedCount;

  return (
    <section style={cardStyles.bordered}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
        Progress
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        {handledCount} of {progress.totalItems} handled
      </div>
      <div
        aria-label="Daily pulse progress"
        style={{
          width: "100%",
          height: 10,
          borderRadius: 999,
          background: "#e5e7eb",
          overflow: "hidden",
          marginBottom: 10
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress.progressPercent}%`,
            background: progress.isCompletedForNow ? "#166534" : "#111827",
            transition: "width 180ms ease"
          }}
        />
      </div>
      <div style={{ fontSize: 14, color: colors.textMuted }}>
        {progress.remainingCount > 0
          ? `${progress.remainingCount} remaining`
          : "No pending items right now"}
      </div>
    </section>
  );
}
