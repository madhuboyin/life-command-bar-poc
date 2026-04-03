import type React from "react";
import { text } from "../../lib/ui";

type Props = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export default function PageHeader({ title, description, actions }: Props) {
  return (
    <header
      style={{
        marginBottom: 24,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16
      }}
    >
      <div>
        <h1 style={text.pageTitle}>{title}</h1>
        {description ? <p style={text.bodyMuted}>{description}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}
