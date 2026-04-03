import React from "react";
import Link from "next/link";

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
          background: "#f7f7f8",
          color: "#111827"
        }}
      >
        <nav
          style={{
            borderBottom: "1px solid #e5e7eb",
            background: "#fff",
            padding: "14px 24px"
          }}
        >
          <div
            style={{
              maxWidth: 980,
              margin: "0 auto",
              display: "flex",
              gap: 16,
              alignItems: "center"
            }}
          >
            <Link href="/" style={{ textDecoration: "none", color: "#111827", fontWeight: 700 }}>
              Life Command Bar
            </Link>
            <Link href="/obligations" style={{ textDecoration: "none", color: "#4b5563" }}>
              Obligations
            </Link>
          </div>
        </nav>

        {children}
      </body>
    </html>
  );
}
