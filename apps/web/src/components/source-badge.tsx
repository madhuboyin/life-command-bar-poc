import type { TrustSourceType } from "../lib/types";
import { colors, radius } from "../lib/ui";

type Props = {
  sourceType: TrustSourceType;
  label?: string;
};

export default function SourceBadge({ sourceType, label }: Props) {
  const resolvedLabel =
    label ??
    (sourceType === "EMAIL"
      ? "Imported from email"
      : sourceType === "UPLOAD"
        ? "Extracted from upload"
        : sourceType === "COMMAND"
          ? "Captured from command"
          : "Created manually");

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: radius.pill,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 600,
        background:
          sourceType === "EMAIL"
            ? "#e0f2fe"
            : sourceType === "UPLOAD"
              ? "#ecfeff"
              : sourceType === "COMMAND"
                ? "#ede9fe"
                : colors.neutralBadgeBg,
        color:
          sourceType === "EMAIL"
            ? "#0c4a6e"
            : sourceType === "UPLOAD"
              ? "#155e75"
              : sourceType === "COMMAND"
                ? "#5b21b6"
                : colors.neutralBadgeText
      }}
    >
      {resolvedLabel}
    </span>
  );
}
