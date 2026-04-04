import Link from "next/link";
import type { AutoFlowListResponse } from "../lib/types";
import { buttonStyles, cardStyles, colors } from "../lib/ui";

type Props = {
  autoFlow: AutoFlowListResponse;
};

export default function ReadyToActBanner({ autoFlow }: Props) {
  if (autoFlow.summary.readyCount === 0) return null;

  return (
    <section style={{ ...cardStyles.bordered, borderColor: "#86efac", background: "#f0fdf4" }}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
        Ready To Handle
      </div>
      <h2 style={{ margin: "0 0 6px 0", fontSize: 22 }}>
        {autoFlow.summary.readyCount} flow{autoFlow.summary.readyCount === 1 ? "" : "s"} ready now
      </h2>
      <p style={{ margin: 0, color: colors.textMuted }}>
        The system prepared recommended paths. You only need to confirm and act.
      </p>
      <div style={{ marginTop: 12 }}>
        <Link href="/pulse" style={buttonStyles.link}>
          Open today&apos;s pulse
        </Link>
      </div>
    </section>
  );
}
