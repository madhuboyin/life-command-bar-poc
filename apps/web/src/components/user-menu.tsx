"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { buttonStyles, colors } from "../lib/ui";

export default function UserMenu({
  user
}: {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}) {
  if (!user) {
    return (
      <Link href="/signin" style={buttonStyles.link}>
        Sign in
      </Link>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
      <div style={{ fontSize: 12, color: colors.textMuted, textAlign: "right" }}>
        <div>{user.name || "Signed in"}</div>
        <div>{user.email || ""}</div>
      </div>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/signin" })}
        style={buttonStyles.secondary}
      >
        Sign out
      </button>
    </div>
  );
}

