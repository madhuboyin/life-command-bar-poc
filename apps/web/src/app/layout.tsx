import React from "react";
import Link from "next/link";
import { colors, spacing } from "../lib/ui";
import { ToastProvider } from "../components/ui/toast-provider";
import { FlowSessionProvider } from "../components/flow-session-provider";

export const metadata = {
  title: "Life Command Bar POC",
  description: "Admin-First Life Command OS"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "Arial, sans-serif",
          margin: 0,
          background: colors.bg,
          color: colors.text
        }}
      >
        <FlowSessionProvider>
          <ToastProvider>
            <nav
            style={{
              borderBottom: `1px solid ${colors.border}`,
              background: colors.surface,
              padding: "14px 24px"
            }}
          >
            <div
              style={{
                maxWidth: spacing.pageWidth,
                margin: "0 auto",
                display: "flex",
                gap: 16,
                alignItems: "center",
                flexWrap: "wrap"
              }}
            >
              <Link href="/" style={{ textDecoration: "none", color: colors.text, fontWeight: 700 }}>
                Life Command Bar
              </Link>
              <Link href="/obligations" style={{ textDecoration: "none", color: colors.textMuted }}>
                Obligations
              </Link>
              <Link href="/focus" style={{ textDecoration: "none", color: colors.textMuted }}>
                Focus Mode
              </Link>
              <Link href="/control-tower" style={{ textDecoration: "none", color: colors.textMuted }}>
                Control Tower
              </Link>
              <Link href="/upcoming" style={{ textDecoration: "none", color: colors.textMuted }}>
                Upcoming
              </Link>
            </div>
            </nav>

            {children}
          </ToastProvider>
        </FlowSessionProvider>
      </body>
    </html>
  );
}
