export type SupportedObligationType = "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";

export type ClassificationResult = {
  type: SupportedObligationType;
  confidence: number;
  scores: Record<SupportedObligationType, number>;
  matchedIndicators: Record<SupportedObligationType, string[]>;
};

const weightedIndicators: Record<SupportedObligationType, Array<{ phrase: string; weight: number }>> = {
  BILL: [
    { phrase: "bill", weight: 1.3 },
    { phrase: "statement", weight: 1.1 },
    { phrase: "payment due", weight: 1.5 },
    { phrase: "amount due", weight: 1.6 },
    { phrase: "invoice", weight: 1.6 },
    { phrase: "balance due", weight: 1.4 },
    { phrase: "autopay", weight: 0.8 },
    { phrase: "utility", weight: 0.9 }
  ],
  SUBSCRIPTION: [
    { phrase: "subscription", weight: 1.7 },
    { phrase: "monthly plan", weight: 1.5 },
    { phrase: "membership", weight: 1.3 },
    { phrase: "renews monthly", weight: 1.6 },
    { phrase: "streaming", weight: 1.2 },
    { phrase: "trial", weight: 0.8 },
    { phrase: "cancel anytime", weight: 0.7 }
  ],
  RENEWAL: [
    { phrase: "renew", weight: 1.8 },
    { phrase: "renewal", weight: 1.8 },
    { phrase: "expires", weight: 1.6 },
    { phrase: "expiration", weight: 1.5 },
    { phrase: "policy renewal", weight: 1.8 },
    { phrase: "auto-renew", weight: 1.4 },
    { phrase: "expiry", weight: 1.3 }
  ],
  COMMITMENT: [
    { phrase: "submit", weight: 1.1 },
    { phrase: "follow up", weight: 1.2 },
    { phrase: "send", weight: 0.8 },
    { phrase: "file", weight: 0.9 },
    { phrase: "complete by", weight: 1.2 },
    { phrase: "remind me", weight: 1.4 },
    { phrase: "remember to", weight: 1.2 }
  ]
};

export function classifyObligationType(text: string, titleHint?: string | null): ClassificationResult {
  const normalizedText = `${titleHint ?? ""}\n${text}`.toLowerCase();

  const scores: Record<SupportedObligationType, number> = {
    BILL: 0.01,
    SUBSCRIPTION: 0.01,
    RENEWAL: 0.01,
    COMMITMENT: 0.01
  };

  const matchedIndicators: Record<SupportedObligationType, string[]> = {
    BILL: [],
    SUBSCRIPTION: [],
    RENEWAL: [],
    COMMITMENT: []
  };

  for (const [type, indicators] of Object.entries(weightedIndicators) as Array<
    [SupportedObligationType, Array<{ phrase: string; weight: number }>]
  >) {
    for (const indicator of indicators) {
      if (normalizedText.includes(indicator.phrase)) {
        scores[type] += indicator.weight;
        matchedIndicators[type].push(indicator.phrase);
      }
    }
  }

  if (/\$\s*\d+/.test(normalizedText) || /amount due/.test(normalizedText)) {
    scores.BILL += 0.7;
  }

  if (/next\s+(week|month|year)/.test(normalizedText) || /due\s+(today|tomorrow)/.test(normalizedText)) {
    scores.COMMITMENT += 0.35;
    scores.RENEWAL += 0.15;
  }

  const ranked = (Object.entries(scores) as Array<[SupportedObligationType, number]>).sort(
    (a, b) => b[1] - a[1]
  );

  const winner = ranked[0][0];
  const topScore = ranked[0][1];
  const secondScore = ranked[1][1];
  const total = ranked.reduce((sum, entry) => sum + entry[1], 0);

  const dominance = total > 0 ? topScore / total : 0;
  const margin = topScore - secondScore;
  const confidence = clamp(0.25 + dominance * 0.5 + Math.min(0.25, margin * 0.1), 0.2, 0.98);

  return {
    type: winner,
    confidence,
    scores,
    matchedIndicators
  };
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}
