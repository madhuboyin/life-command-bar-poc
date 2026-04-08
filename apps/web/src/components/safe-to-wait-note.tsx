import { buildPrimaryReassurance } from "../lib/emotional-trust.service";
import { colors } from "../lib/ui";

type Props = {
  note?: string | null;
};

export default function SafeToWaitNote({ note }: Props) {
  const message = buildPrimaryReassurance({
    emotionalState: "SAFE_TO_WAIT"
  });

  return (
    <div style={{ display: "grid", gap: 2 }}>
      <div style={{ fontSize: 13, color: colors.textMuted }}>{message.primary}</div>
      <div style={{ fontSize: 12, color: colors.textMuted }}>
        {note || message.supporting}
      </div>
    </div>
  );
}
