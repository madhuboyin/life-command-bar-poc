import { buildActionAftercareMessage } from "../lib/emotional-trust.service";
import { colors } from "../lib/ui";

type Props = {
  actionType?: string | null;
};

export default function ActionAftercareInline({ actionType }: Props) {
  const message = buildActionAftercareMessage({ actionType });

  return (
    <div style={{ display: "grid", gap: 2 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{message.primary}</div>
      {message.supporting ? (
        <div style={{ fontSize: 12, color: colors.textMuted }}>{message.supporting}</div>
      ) : null}
    </div>
  );
}
