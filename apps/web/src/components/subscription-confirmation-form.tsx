"use client";

import { useMemo, useState } from "react";
import { updateSubscription } from "../lib/api";
import type {
  SubscriptionBillingPeriod,
  SubscriptionLifecycleState,
  SubscriptionRegistryDetail
} from "../lib/types";
import { buttonStyles, cardStyles, colors, inputStyles } from "../lib/ui";

export default function SubscriptionConfirmationForm({
  subscription
}: {
  subscription: SubscriptionRegistryDetail;
}) {
  const [planName, setPlanName] = useState(subscription.planName ?? "");
  const [recurringPrice, setRecurringPrice] = useState(
    subscription.recurringPrice !== null ? String(subscription.recurringPrice) : ""
  );
  const [billingPeriod, setBillingPeriod] = useState<SubscriptionBillingPeriod>(
    subscription.billingPeriod
  );
  const [lifecycleState, setLifecycleState] = useState<SubscriptionLifecycleState>(
    subscription.lifecycleState
  );
  const [nextRenewalDate, setNextRenewalDate] = useState(
    toInputDate(subscription.nextRenewalDate)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasChanges = useMemo(() => {
    return (
      (planName || "") !== (subscription.planName ?? "") ||
      normalizePrice(recurringPrice) !== subscription.recurringPrice ||
      billingPeriod !== subscription.billingPeriod ||
      lifecycleState !== subscription.lifecycleState ||
      normalizeDate(nextRenewalDate) !== normalizeDate(subscription.nextRenewalDate)
    );
  }, [
    billingPeriod,
    lifecycleState,
    nextRenewalDate,
    planName,
    recurringPrice,
    subscription.billingPeriod,
    subscription.lifecycleState,
    subscription.nextRenewalDate,
    subscription.planName,
    subscription.recurringPrice
  ]);

  async function handleSave() {
    try {
      setLoading(true);
      setError(null);
      setMessage(null);

      await updateSubscription(subscription.id, {
        planName: planName.trim() ? planName.trim() : null,
        recurringPrice: normalizePrice(recurringPrice),
        billingPeriod,
        lifecycleState,
        nextRenewalDate: normalizeDate(nextRenewalDate)
      });

      setMessage("Subscription updates saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save subscription");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
      <h2 style={{ margin: 0 }}>Confirm / Correct</h2>
      <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>
        Adjust lifecycle, price, and renewal details when Gmail evidence is incomplete or conflicting.
      </p>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: colors.textMuted }}>Plan name</span>
        <input value={planName} onChange={(event) => setPlanName(event.target.value)} style={inputStyles.input} />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: colors.textMuted }}>Recurring price</span>
        <input
          value={recurringPrice}
          onChange={(event) => setRecurringPrice(event.target.value)}
          placeholder="e.g. 15.49"
          style={inputStyles.input}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: colors.textMuted }}>Billing period</span>
        <select value={billingPeriod} onChange={(event) => setBillingPeriod(event.target.value as SubscriptionBillingPeriod)} style={inputStyles.input}>
          <option value="UNKNOWN">Unknown</option>
          <option value="MONTHLY">Monthly</option>
          <option value="YEARLY">Yearly</option>
          <option value="QUARTERLY">Quarterly</option>
          <option value="WEEKLY">Weekly</option>
        </select>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: colors.textMuted }}>Lifecycle state</span>
        <select value={lifecycleState} onChange={(event) => setLifecycleState(event.target.value as SubscriptionLifecycleState)} style={inputStyles.input}>
          <option value="DISCOVERED">Discovered</option>
          <option value="TRIALING">Trialing</option>
          <option value="ACTIVE">Active</option>
          <option value="RENEWING">Renewing</option>
          <option value="PRICE_CHANGED">Price changed</option>
          <option value="CANCELING">Canceling</option>
          <option value="CANCELED">Canceled</option>
          <option value="ENDED">Ended</option>
          <option value="INACTIVE">Inactive</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: colors.textMuted }}>Next renewal date</span>
        <input type="date" value={nextRenewalDate} onChange={(event) => setNextRenewalDate(event.target.value)} style={inputStyles.input} />
      </label>

      <div>
        <button type="button" disabled={loading || !hasChanges} onClick={() => void handleSave()} style={buttonStyles.primary}>
          {loading ? "Saving..." : "Save corrections"}
        </button>
      </div>

      {error ? <div style={{ color: colors.errorText, fontSize: 13 }}>{error}</div> : null}
      {message ? <div style={{ color: colors.successText, fontSize: 13 }}>{message}</div> : null}
    </section>
  );
}

function normalizePrice(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed.toFixed(2));
}

function toInputDate(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
