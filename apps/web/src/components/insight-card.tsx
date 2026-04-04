import type { DashboardInsightCard as DashboardInsightCardType } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";
import ClickableCardLink from "./ui/clickable-card-link";
import WhyThisExplanation from "./why-this-explanation";

type Props = {
  card: DashboardInsightCardType;
  href?: string | null;
};

export default function InsightCard({ card, href }: Props) {
  const content = (
    <article style={{ ...cardStyles.item, ...getToneStyle(card.tone) }}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>{card.title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{card.value}</div>
      <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>{card.supportingText}</p>
      <div style={{ marginTop: 10 }}>
        <WhyThisExplanation why={card.why} decisionTrace={card.decisionTrace} />
      </div>
      {href ? (
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: "#1d4ed8" }}>
          View items →
        </div>
      ) : null}
    </article>
  );

  if (!href) return content;

  return (
    <ClickableCardLink href={href} ariaLabel={`${card.title}: view filtered obligations`}>
      {content}
    </ClickableCardLink>
  );
}

function getToneStyle(tone: DashboardInsightCardType["tone"]) {
  if (tone === "warning") {
    return {
      borderColor: "#fdba74",
      background: "#fffbeb"
    };
  }

  if (tone === "positive") {
    return {
      borderColor: "#86efac",
      background: "#f0fdf4"
    };
  }

  return {
    borderColor: "#d1d5db",
    background: "#f9fafb"
  };
}
