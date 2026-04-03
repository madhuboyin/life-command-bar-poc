"use client";

import type React from "react";
import Link from "next/link";
import { useState } from "react";
import { radius } from "../../lib/ui";

type Props = {
  href: string;
  children: React.ReactNode;
  ariaLabel?: string;
};

export default function ClickableCardLink({ href, children, ariaLabel }: Props) {
  const [isInteractive, setIsInteractive] = useState(false);

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      onMouseEnter={() => setIsInteractive(true)}
      onMouseLeave={() => setIsInteractive(false)}
      onFocus={() => setIsInteractive(true)}
      onBlur={() => setIsInteractive(false)}
      onTouchStart={() => setIsInteractive(true)}
      onTouchEnd={() => setIsInteractive(false)}
      style={{
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
        display: "block",
        borderRadius: radius.lg,
        transform: isInteractive ? "translateY(-1px)" : "translateY(0)",
        transition: "transform 140ms ease, filter 140ms ease",
        filter: isInteractive ? "brightness(0.99)" : "none"
      }}
    >
      {children}
    </Link>
  );
}
