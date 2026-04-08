import assert from "node:assert/strict";
import test from "node:test";
import { ObligationStatus, ScopeType } from "@prisma/client";
import { TodayPrioritizationService, type TodayPrioritizationInput } from "./today-prioritization.service";

const FIXED_NOW = new Date("2026-04-08T12:00:00.000Z");

function createInput(input: Partial<TodayPrioritizationInput> = {}): TodayPrioritizationInput {
  const has = <K extends keyof TodayPrioritizationInput>(key: K) =>
    Object.prototype.hasOwnProperty.call(input, key);

  return {
    id: input.id ?? "obl_1",
    itemType: input.itemType ?? "OBLIGATION",
    title: input.title ?? "Utility bill",
    subtitle: input.subtitle ?? null,
    category: input.category ?? "BILL",
    type: input.type ?? "BILL",
    status: input.status ?? ObligationStatus.ACTIVE,
    vendorName: input.vendorName ?? "Utility Co",
    amount: has("amount") ? (input.amount as number | null) : 72,
    currency: has("currency") ? (input.currency as string | null) : "USD",
    dueDate: has("dueDate")
      ? (input.dueDate as string | null)
      : "2026-04-09T00:00:00.000Z",
    renewalDate: has("renewalDate")
      ? (input.renewalDate as string | null)
      : null,
    priorityHintScore: input.priorityHintScore ?? null,
    confidenceBand: input.confidenceBand ?? "HIGH",
    confidenceScore: input.confidenceScore ?? 0.9,
    urgencyScore: input.urgencyScore ?? 80,
    importanceScore: input.importanceScore ?? 75,
    needsReview: input.needsReview ?? false,
    sourceSummary: input.sourceSummary ?? "source",
    scopeType: input.scopeType ?? ScopeType.PERSONAL,
    assignee: input.assignee ?? null,
    lastActedAt: input.lastActedAt ?? null,
    subscriptionId: input.subscriptionId ?? null
  };
}

test("builds calm, action-oriented due-soon copy", () => {
  const service = new TodayPrioritizationService();
  const ranked = service.rank([
    createInput({
      dueDate: "2026-04-10T12:00:00.000Z",
      renewalDate: null,
      needsReview: false
    })
  ], FIXED_NOW);

  assert.equal(ranked[0]?.whyNow, "This is due in 2 days.");
  assert.equal(ranked[0]?.whyThisMatters, "Handling this now helps avoid surprise costs.");
});

test("review-needed items avoid internal confidence/system jargon", () => {
  const service = new TodayPrioritizationService();
  const ranked = service.rank([
    createInput({
      id: "review",
      confidenceBand: "LOW",
      needsReview: true,
      dueDate: null,
      renewalDate: null
    })
  ], FIXED_NOW);

  assert.equal(ranked[0]?.whyNow, "A quick review is safer before deciding.");
  assert.match(ranked[0]?.whyNow ?? "", /quick review/i);
  assert.doesNotMatch(ranked[0]?.whyNow ?? "", /confidence|signal|prioritized/i);
});

test("postponed items use human follow-through wording", () => {
  const service = new TodayPrioritizationService();
  const ranked = service.rank([
    createInput({
      id: "postponed",
      status: ObligationStatus.POSTPONED,
      dueDate: null,
      renewalDate: null,
      amount: null,
      type: "COMMITMENT"
    })
  ], FIXED_NOW);

  assert.equal(ranked[0]?.whyNow, "You postponed this earlier, so it is back on deck.");
  assert.equal(ranked[0]?.whyThisMatters, "Handling this now keeps today lighter.");
});
