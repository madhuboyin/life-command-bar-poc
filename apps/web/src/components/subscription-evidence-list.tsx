import type { SubscriptionEvidenceItem } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";

export default function SubscriptionEvidenceList({
  items
}: {
  items: SubscriptionEvidenceItem[];
}) {
  if (items.length === 0) {
    return (
      <div style={{ ...cardStyles.bordered, color: colors.textMuted, fontSize: 13 }}>
        No evidence captured yet.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item) => (
        <div key={item.id} style={{ ...cardStyles.bordered, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {item.sourceSubType ? item.sourceSubType.toLowerCase().replace(/_/g, " ") : "signal"}
          </div>
          <div style={{ color: colors.textMuted, fontSize: 13 }}>
            {item.sourceType} · Confidence {Math.round(item.confidenceScore * 100)}%
          </div>
          <div style={{ color: colors.textMuted, fontSize: 13 }}>
            Observed {formatDate(item.observedAt)} · Ref {item.referenceType}:{item.referenceId}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}
