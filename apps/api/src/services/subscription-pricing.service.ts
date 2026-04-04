import {
  SubscriptionBillingPeriod,
  SubscriptionPriceType
} from "@prisma/client";
import type { GmailSubscriptionExtractionResult } from "./gmail-subscription-extractor";

export type SubscriptionPricingSnapshot = {
  recurringPrice: number | null;
  introPrice: number | null;
  amountLastCharged: number | null;
  currency: string | null;
  billingPeriod: SubscriptionBillingPeriod;
};

export type SubscriptionPricingUpdateResult = {
  recurringPrice: number | null;
  introPrice: number | null;
  amountLastCharged: number | null;
  currency: string | null;
  billingPeriod: SubscriptionBillingPeriod;
  priceChanged: boolean;
  historyEntries: Array<{
    priceType: SubscriptionPriceType;
    amount: number;
    currency: string;
    billingPeriod: SubscriptionBillingPeriod | null;
    effectiveDate: Date | null;
  }>;
};

export class SubscriptionPricingService {
  applySignal(input: {
    current: SubscriptionPricingSnapshot;
    extraction: GmailSubscriptionExtractionResult;
    observedAt: Date;
  }): SubscriptionPricingUpdateResult {
    const currency =
      normalizeCurrency(input.extraction.currency) ??
      normalizeCurrency(input.current.currency) ??
      null;

    const nextBillingPeriod = toBillingPeriod(input.extraction.billingPeriod, input.current.billingPeriod);
    const nextIntroPrice =
      input.extraction.introPrice !== null ? input.extraction.introPrice : input.current.introPrice;
    const nextRecurringPrice =
      input.extraction.recurringPrice !== null
        ? input.extraction.recurringPrice
        : input.current.recurringPrice;
    const nextAmountLastCharged =
      input.extraction.amountCharged !== null
        ? input.extraction.amountCharged
        : input.current.amountLastCharged;

    const priceChanged =
      input.current.recurringPrice !== null &&
      nextRecurringPrice !== null &&
      Math.abs(input.current.recurringPrice - nextRecurringPrice) >= 0.01;

    const historyEntries: SubscriptionPricingUpdateResult["historyEntries"] = [];
    if (currency) {
      if (input.extraction.introPrice !== null) {
        historyEntries.push({
          priceType: SubscriptionPriceType.INTRO,
          amount: input.extraction.introPrice,
          currency,
          billingPeriod: nextBillingPeriod !== SubscriptionBillingPeriod.UNKNOWN ? nextBillingPeriod : null,
          effectiveDate: input.observedAt
        });
      }
      if (input.extraction.recurringPrice !== null) {
        historyEntries.push({
          priceType: SubscriptionPriceType.RECURRING,
          amount: input.extraction.recurringPrice,
          currency,
          billingPeriod: nextBillingPeriod !== SubscriptionBillingPeriod.UNKNOWN ? nextBillingPeriod : null,
          effectiveDate: input.observedAt
        });
      }
      if (input.extraction.amountCharged !== null) {
        historyEntries.push({
          priceType: SubscriptionPriceType.CHARGED,
          amount: input.extraction.amountCharged,
          currency,
          billingPeriod: nextBillingPeriod !== SubscriptionBillingPeriod.UNKNOWN ? nextBillingPeriod : null,
          effectiveDate: input.observedAt
        });
      }
    }

    return {
      recurringPrice: nextRecurringPrice,
      introPrice: nextIntroPrice,
      amountLastCharged: nextAmountLastCharged,
      currency,
      billingPeriod: nextBillingPeriod,
      priceChanged,
      historyEntries
    };
  }
}

function toBillingPeriod(
  extracted: string,
  existing: SubscriptionBillingPeriod
) {
  if (extracted === "MONTHLY") return SubscriptionBillingPeriod.MONTHLY;
  if (extracted === "YEARLY") return SubscriptionBillingPeriod.YEARLY;
  if (extracted === "QUARTERLY") return SubscriptionBillingPeriod.QUARTERLY;
  return existing;
}

function normalizeCurrency(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) return null;
  return normalized;
}
