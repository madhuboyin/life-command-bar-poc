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
            {item.sourceSubType ? item.sourceSubType.toLowerCase().replace(/_/g, " ") : "update"}
          </div>
          <div style={{ color: colors.textMuted, fontSize: 13 }}>
            {sourceTypeLabel(item.sourceType)} · {confidenceLabel(item.confidenceScore)}
          </div>
          <div style={{ color: colors.textMuted, fontSize: 13 }}>
            Seen {formatDate(item.observedAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

function confidenceLabel(score: number) {
  if (score >= 0.75) return "Looks clear";
  if (score >= 0.5) return "Worth a quick look";
  return "Not sure yet";
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function sourceTypeLabel(sourceType: string) {
  const normalized = sourceType.toLowerCase();
  if (normalized.includes("email") || normalized.includes("gmail")) return "Email";
  if (normalized.includes("upload")) return "Upload";
  if (normalized.includes("command")) return "Manual";
  return sourceType.replace(/_/g, " ").toLowerCase();
}
