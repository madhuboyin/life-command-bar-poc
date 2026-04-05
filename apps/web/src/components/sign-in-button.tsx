"use client";

import { signIn } from "next-auth/react";
import { buttonStyles } from "../lib/ui";

export default function SignInButton({
  callbackUrl,
  disabled
}: {
  callbackUrl?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void signIn("google", { callbackUrl: callbackUrl || "/" })}
      style={buttonStyles.primary}
    >
      {disabled ? "Google sign-in unavailable" : "Continue with Google"}
    </button>
  );
}
