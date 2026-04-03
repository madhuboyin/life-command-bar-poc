import type React from "react";
import { cardStyles } from "../../lib/ui";

type Props = {
  title?: string;
  description?: string;
  children: React.ReactNode;
};

export default function SectionCard({ title, description, children }: Props) {
  return (
    <section style={cardStyles.section}>
      {(title || description) && (
        <div style={{ marginBottom: 14 }}>
          {title ? <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2> : null}
          {description ? (
            <p style={{ margin: "6px 0 0 0", color: "#6b7280" }}>{description}</p>
          ) : null}
        </div>
      )}
      {children}
    </section>
  );
}
