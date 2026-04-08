"use client";

import { colors } from "../lib/ui";

type Props = {
  label?: string;
  children: React.ReactNode;
};

export default function WhyThisToggle({ label = "Why this?", children }: Props) {
  return (
    <details>
      <summary style={{ cursor: "pointer", fontSize: 13, color: colors.textMuted }}>
        {label}
      </summary>
      <div style={{ marginTop: 8, fontSize: 13, color: colors.textMuted }}>{children}</div>
    </details>
  );
}
