"use client";

import type { DailyCommandCenterItem, TodayActionKey } from "../lib/types";
import { buttonStyles } from "../lib/ui";
import {
  buildActionLabel,
  trackMessageAction
} from "../lib/human-language.service";
import {
  trackActionAfterReassurance,
  trackDeferAfterReassurance
} from "../lib/emotional-trust.service";

export default function TodayActionBar({
  item,
  loading,
  onAction
}: {
  item: DailyCommandCenterItem;
  loading: TodayActionKey | null;
  onAction: (actionKey: TodayActionKey) => Promise<void>;
}) {
  const actions = [item.primaryAction, ...item.secondaryActions].slice(0, 3);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, max-content))",
        gap: 10
      }}
    >
      {actions.map((action, index) => {
        const label = buildActionLabel(action.label || action.key, {
          presentationStyle: item.presentationStyle,
          reminderStyle:
            action.key === "REMIND_LATER" ? item.reminderStyle : "DEFAULT",
          isPrimary: index === 0
        });
        return (
          <button
            key={`${item.id}_${action.key}_${index}`}
            type="button"
            onClick={() => {
              trackMessageAction(action.key);
              trackActionAfterReassurance(action.key);
              if (action.key === "REMIND_LATER") {
                trackDeferAfterReassurance("today_action_bar_remind_later");
              }
              void onAction(action.key);
            }}
            disabled={loading !== null}
            style={
              index === 0
                ? buttonStyles.primary
                : action.mode === "NAVIGATE"
                  ? buttonStyles.link
                  : buttonStyles.secondary
            }
          >
            {loading === action.key ? "Saving..." : label}
          </button>
        );
      })}
    </div>
  );
}
