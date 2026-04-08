"use client";

import { colors } from "../lib/ui";
import { trackWhyThisOpened } from "../lib/emotional-trust.service";

type Props = {
  label?: string;
  children: React.ReactNode;
  metricKey?: string;
  onOpened?: () => void;
};

export default function WhyThisToggle({
  label = "Why this?",
  children,
  metricKey,
  onOpened
}: Props) {
  return (
    <details
      onToggle={(event) => {
        const details = event.currentTarget;
        if (details.open) {
          trackWhyThisOpened(metricKey ?? label);
          onOpened?.();
        }
      }}
    >
      <summary style={{ cursor: "pointer", fontSize: 13, color: colors.textMuted }}>
        {label}
      </summary>
      <div style={{ marginTop: 8, fontSize: 13, color: colors.textMuted }}>{children}</div>
    </details>
  );
}
