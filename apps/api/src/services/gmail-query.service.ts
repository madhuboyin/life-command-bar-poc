export type GmailQueryKey =
  | "subscription_renewal"
  | "subscription_welcome"
  | "subscription_cancellation"
  | "billing_due"
  | "recurring_receipt";

export type GmailQueryDefinition = {
  key: GmailQueryKey;
  category:
    | "subscriptions"
    | "bills"
    | "renewals"
    | "receipts"
    | "cancellations"
    | "welcome";
  query: string;
};

export type GmailQueryConfig = {
  windowDays: 30 | 90 | 365;
  scanSubscriptions: boolean;
  scanBills: boolean;
  scanRenewals: boolean;
  includeRecurringReceipts: boolean;
};

const BASE_QUERY_BY_KEY: Record<GmailQueryKey, Omit<GmailQueryDefinition, "query"> & { base: string }> = {
  subscription_renewal: {
    key: "subscription_renewal",
    category: "subscriptions",
    base:
      'subject:(renew OR renewal OR subscription OR expires OR expiring OR auto-renew OR "membership renewal")'
  },
  subscription_welcome: {
    key: "subscription_welcome",
    category: "welcome",
    base:
      'subject:("welcome to" OR "thanks for subscribing" OR "plan is active" OR "membership confirmed" OR "trial started")'
  },
  subscription_cancellation: {
    key: "subscription_cancellation",
    category: "cancellations",
    base:
      'subject:(cancelled OR canceled OR "will not renew" OR "subscription canceled" OR "subscription cancelled" OR "auto-renew off" OR "membership ends")'
  },
  billing_due: {
    key: "billing_due",
    category: "bills",
    base:
      'subject:("payment due" OR invoice OR statement OR bill OR "amount due" OR "due date")'
  },
  recurring_receipt: {
    key: "recurring_receipt",
    category: "receipts",
    base:
      'subject:(receipt OR membership OR plan OR "payment confirmation" OR "subscription receipt")'
  }
};

export class GmailQueryService {
  buildQueries(config: GmailQueryConfig): GmailQueryDefinition[] {
    const windowClause = this.buildWindowClause(config.windowDays);
    const definitions: GmailQueryDefinition[] = [];

    if (config.scanSubscriptions || config.scanRenewals) {
      const item = BASE_QUERY_BY_KEY.subscription_renewal;
      definitions.push({
        key: item.key,
        category: config.scanRenewals && !config.scanSubscriptions ? "renewals" : item.category,
        query: `${item.base} ${windowClause}`.trim()
      });
    }

    if (config.scanSubscriptions) {
      const item = BASE_QUERY_BY_KEY.subscription_welcome;
      definitions.push({
        key: item.key,
        category: item.category,
        query: `${item.base} ${windowClause}`.trim()
      });
    }

    if (config.scanSubscriptions || config.scanRenewals) {
      const item = BASE_QUERY_BY_KEY.subscription_cancellation;
      definitions.push({
        key: item.key,
        category: item.category,
        query: `${item.base} ${windowClause}`.trim()
      });
    }

    if (config.scanBills) {
      const item = BASE_QUERY_BY_KEY.billing_due;
      definitions.push({
        key: item.key,
        category: item.category,
        query: `${item.base} ${windowClause}`.trim()
      });
    }

    if (config.includeRecurringReceipts) {
      const item = BASE_QUERY_BY_KEY.recurring_receipt;
      definitions.push({
        key: item.key,
        category: item.category,
        query: `${item.base} ${windowClause}`.trim()
      });
    }

    return definitions;
  }

  private buildWindowClause(windowDays: 30 | 90 | 365) {
    const sinceSeconds = Math.floor((Date.now() - windowDays * 24 * 60 * 60 * 1000) / 1000);
    return `after:${sinceSeconds}`;
  }
}
