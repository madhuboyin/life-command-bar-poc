import type React from "react";
import { feedbackStyles } from "../../lib/ui";

type Props = {
  variant: "error" | "success";
  children: React.ReactNode;
};

export default function StatusMessage({ variant, children }: Props) {
  return (
    <div style={variant === "error" ? feedbackStyles.error : feedbackStyles.success}>
      {children}
    </div>
  );
}
