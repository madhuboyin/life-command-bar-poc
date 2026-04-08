import type { EmotionalTrustMessage } from "../lib/emotional-trust.service";
import { colors } from "../lib/ui";

type Props = {
  message: EmotionalTrustMessage;
  compact?: boolean;
};

export default function ReassuranceInline({ message, compact = false }: Props) {
  return (
    <div style={{ display: "grid", gap: compact ? 2 : 4 }}>
      <div style={{ fontSize: compact ? 13 : 14, fontWeight: 600 }}>{message.primary}</div>
      {message.supporting ? (
        <div style={{ fontSize: compact ? 12 : 13, color: colors.textMuted }}>
          {message.supporting}
        </div>
      ) : null}
    </div>
  );
}
