import type React from "react";
import { colors, radius } from "../../lib/ui";

type Props = {
  title: string;
  description: string;
  action?: React.ReactNode;
};

export default function EmptyState({ title, description, action }: Props) {
  return (
    <div
      style={{
        border: `1px dashed ${colors.borderStrong}`,
        borderRadius: radius.lg,
        padding: 24,
        background: "#fff",
        textAlign: "left"
      }}
    >
      <h3 style={{ margin: "0 0 8px 0" }}>{title}</h3>
      <p style={{ margin: "0 0 14px 0", color: colors.textMuted }}>
        {description}
      </p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
