import { buildHouseholdResponsibilityMessage } from "../lib/emotional-trust.service";
import { colors } from "../lib/ui";

type Props = {
  scopeType?: "PERSONAL" | "HOUSEHOLD" | null;
  assigneeName?: string | null;
  dueSoon?: boolean;
};

export default function SharedContextNote({
  scopeType,
  assigneeName,
  dueSoon = false
}: Props) {
  const message = buildHouseholdResponsibilityMessage({
    scopeType,
    assigneeName,
    dueSoon
  });

  if (!message) return null;

  return (
    <div style={{ display: "grid", gap: 2 }}>
      <div style={{ fontSize: 13, color: colors.textMuted }}>{message.primary}</div>
      {message.supporting ? (
        <div style={{ fontSize: 12, color: colors.textMuted }}>{message.supporting}</div>
      ) : null}
    </div>
  );
}
