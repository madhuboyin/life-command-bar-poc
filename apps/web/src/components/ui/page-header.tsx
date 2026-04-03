"use client";

import type React from "react";
import { text } from "../../lib/ui";
import { useIsMobile } from "../../lib/use-is-mobile";

type Props = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export default function PageHeader({ title, description, actions }: Props) {
  const isMobile = useIsMobile();

  return (
    <header
      style={{
        marginBottom: 24,
        display: "flex",
        justifyContent: "space-between",
        alignItems: isMobile ? "stretch" : "flex-start",
        flexDirection: isMobile ? "column" : "row",
        gap: 16
      }}
    >
      <div>
        <h1 style={isMobile ? text.pageTitleMobile : text.pageTitle}>{title}</h1>
        {description ? <p style={text.bodyMuted}>{description}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}
