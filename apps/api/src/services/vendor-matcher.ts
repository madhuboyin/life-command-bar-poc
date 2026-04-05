import {
  VENDOR_PROFILES,
  type VendorCategory,
  type VendorLifecycleKeywordSet,
  type VendorProfile
} from "./vendor-profiles";

export type VendorMatchOutcome = "MATCHED" | "UNKNOWN" | "CONFLICT" | "SUPPRESSED";

export type VendorSignalMatch = {
  kind:
    | "sender_domain"
    | "subject_keyword"
    | "body_keyword"
    | "alias"
    | "lifecycle_keyword"
    | "negative_keyword"
    | "category_hint";
  value: string;
  score: number;
};

export type VendorMatchCandidateScore = {
  vendorKey: string;
  canonicalName: string;
  category: VendorCategory;
  score: number;
  matchedSignals: VendorSignalMatch[];
  negativeSignals: VendorSignalMatch[];
};

export type VendorMatchResult = {
  outcome: VendorMatchOutcome;
  vendorKey: string | null;
  canonicalName: string | null;
  category: VendorCategory;
  score: number;
  matchedSignals: VendorSignalMatch[];
  conflicts: VendorMatchCandidateScore[];
  suppressedReason: string | null;
};

export type VendorMatchInput = {
  sender: string;
  subject: string;
  bodyText: string;
  snippet?: string | null;
  lifecycleTypeHint?: "WELCOME" | "RENEWAL" | "RECEIPT" | "CANCELLATION" | "BILLING" | "STATEMENT";
  expectedCategoryHint?: VendorCategory | null;
  profiles?: VendorProfile[];
};

type ScoreConfig = {
  domain: number;
  alias: number;
  subjectKeyword: number;
  bodyKeyword: number;
  lifecycleKeyword: number;
  categoryHint: number;
  negativeKeyword: number;
  conflictPenalty: number;
};

const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  domain: 0.62,
  alias: 0.2,
  subjectKeyword: 0.12,
  bodyKeyword: 0.08,
  lifecycleKeyword: 0.1,
  categoryHint: 0.06,
  negativeKeyword: 0.35,
  conflictPenalty: 0.08
};

export function matchVendorProfile(input: VendorMatchInput): VendorMatchResult {
  const profiles = input.profiles ?? VENDOR_PROFILES;
  const senderDomain = extractSenderDomain(input.sender);
  const normalizedSubject = normalizeText(input.subject);
  const normalizedBody = normalizeText([input.bodyText, input.snippet ?? ""].join("\n"));

  const ranked = profiles
    .map((profile) =>
      scoreProfile({
        profile,
        senderDomain,
        normalizedSubject,
        normalizedBody,
        lifecycleTypeHint: input.lifecycleTypeHint,
        expectedCategoryHint: input.expectedCategoryHint ?? null,
        config: DEFAULT_SCORE_CONFIG
      })
    )
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return {
      outcome: "UNKNOWN",
      vendorKey: null,
      canonicalName: null,
      category: "UNKNOWN",
      score: 0,
      matchedSignals: [],
      conflicts: [],
      suppressedReason: null
    };
  }

  const best = ranked[0];
  const second = ranked[1] ?? null;

  if (best.negativeSignals.length > best.matchedSignals.length) {
    return {
      outcome: "SUPPRESSED",
      vendorKey: best.vendorKey,
      canonicalName: best.canonicalName,
      category: best.category,
      score: clamp(best.score - DEFAULT_SCORE_CONFIG.negativeKeyword * 0.5, 0, 1),
      matchedSignals: [...best.matchedSignals, ...best.negativeSignals],
      conflicts: second ? [second] : [],
      suppressedReason: "negative_signal_dominates"
    };
  }

  if (second && best.score >= 0.44 && second.score >= 0.4 && best.score - second.score < 0.1) {
    return {
      outcome: "CONFLICT",
      vendorKey: best.vendorKey,
      canonicalName: best.canonicalName,
      category: best.category,
      score: clamp(best.score - DEFAULT_SCORE_CONFIG.conflictPenalty, 0, 1),
      matchedSignals: best.matchedSignals,
      conflicts: [best, second],
      suppressedReason: null
    };
  }

  if (best.score < 0.42) {
    return {
      outcome: "UNKNOWN",
      vendorKey: null,
      canonicalName: null,
      category: "UNKNOWN",
      score: best.score,
      matchedSignals: best.matchedSignals,
      conflicts: second ? [second] : [],
      suppressedReason: null
    };
  }

  return {
    outcome: "MATCHED",
    vendorKey: best.vendorKey,
    canonicalName: best.canonicalName,
    category: best.category,
    score: best.score,
    matchedSignals: best.matchedSignals,
    conflicts: second && second.score >= 0.36 ? [second] : [],
    suppressedReason: null
  };
}

function scoreProfile(input: {
  profile: VendorProfile;
  senderDomain: string | null;
  normalizedSubject: string;
  normalizedBody: string;
  lifecycleTypeHint?: VendorMatchInput["lifecycleTypeHint"];
  expectedCategoryHint: VendorCategory | null;
  config: ScoreConfig;
}): VendorMatchCandidateScore {
  const { profile, config } = input;
  const matchedSignals: VendorSignalMatch[] = [];
  const negativeSignals: VendorSignalMatch[] = [];
  let score = 0;

  if (input.senderDomain) {
    for (const domain of profile.senderDomains) {
      if (domainEqualsOrSubdomain(input.senderDomain, domain)) {
        score += config.domain * profile.confidenceWeight;
        matchedSignals.push({
          kind: "sender_domain",
          value: domain,
          score: config.domain
        });
        break;
      }
    }
  }

  const normalizedAliasSet = profile.aliases.map(normalizeText);
  const canonical = normalizeText(profile.canonicalName);
  const senderValue = normalizeText(input.senderDomain ?? "");
  for (const alias of [canonical, ...normalizedAliasSet]) {
    if (!alias) continue;
    if (containsTokenized(input.normalizedSubject, alias) || containsTokenized(input.normalizedBody, alias)) {
      score += config.alias * profile.confidenceWeight;
      matchedSignals.push({
        kind: "alias",
        value: alias,
        score: config.alias
      });
      break;
    }
    if (senderValue && containsTokenized(senderValue, alias)) {
      score += config.alias * profile.confidenceWeight;
      matchedSignals.push({
        kind: "alias",
        value: alias,
        score: config.alias
      });
      break;
    }
  }

  score += accumulateKeywordSignals({
    keywords: profile.subjectKeywords,
    source: input.normalizedSubject,
    signalKind: "subject_keyword",
    baseScore: config.subjectKeyword,
    confidenceWeight: profile.confidenceWeight,
    sink: matchedSignals
  });

  score += accumulateKeywordSignals({
    keywords: profile.bodyKeywords,
    source: input.normalizedBody,
    signalKind: "body_keyword",
    baseScore: config.bodyKeyword,
    confidenceWeight: profile.confidenceWeight,
    sink: matchedSignals
  });

  const lifecycleKeywords = resolveLifecycleKeywordSet(
    profile.lifecycleKeywords,
    input.lifecycleTypeHint
  );
  if (lifecycleKeywords.length > 0) {
    score += accumulateKeywordSignals({
      keywords: lifecycleKeywords,
      source: `${input.normalizedSubject}\n${input.normalizedBody}`,
      signalKind: "lifecycle_keyword",
      baseScore: config.lifecycleKeyword,
      confidenceWeight: profile.confidenceWeight,
      sink: matchedSignals
    });
  }

  if (input.expectedCategoryHint && input.expectedCategoryHint === profile.category) {
    score += config.categoryHint;
    matchedSignals.push({
      kind: "category_hint",
      value: profile.category,
      score: config.categoryHint
    });
  }

  score -= accumulateKeywordSignals({
    keywords: profile.negativeKeywords,
    source: `${input.normalizedSubject}\n${input.normalizedBody}`,
    signalKind: "negative_keyword",
    baseScore: config.negativeKeyword,
    confidenceWeight: 1,
    sink: negativeSignals
  });

  return {
    vendorKey: profile.key,
    canonicalName: profile.canonicalName,
    category: profile.category,
    score: clamp(score, 0, 1),
    matchedSignals,
    negativeSignals
  };
}

function accumulateKeywordSignals(input: {
  keywords: string[];
  source: string;
  signalKind: VendorSignalMatch["kind"];
  baseScore: number;
  confidenceWeight: number;
  sink: VendorSignalMatch[];
}) {
  let total = 0;
  let matchedCount = 0;

  for (const rawKeyword of input.keywords) {
    const keyword = normalizeText(rawKeyword);
    if (!keyword) continue;
    if (!containsTokenized(input.source, keyword)) continue;

    const score = input.baseScore * input.confidenceWeight;
    input.sink.push({
      kind: input.signalKind,
      value: keyword,
      score
    });
    total += score;
    matchedCount += 1;

    if (matchedCount >= 3) break;
  }

  return total;
}

function resolveLifecycleKeywordSet(
  set: VendorLifecycleKeywordSet,
  hint: VendorMatchInput["lifecycleTypeHint"]
) {
  if (!hint) return [];
  if (hint === "WELCOME") return set.welcome;
  if (hint === "RENEWAL") return set.renewal;
  if (hint === "RECEIPT") return set.receipt;
  if (hint === "CANCELLATION") return set.cancellation;
  if (hint === "BILLING") return set.billing;
  if (hint === "STATEMENT") return set.statement;
  return [];
}

function extractSenderDomain(sender: string) {
  const trimmed = sender.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w@.+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTokenized(text: string, needle: string) {
  if (!text || !needle) return false;
  if (text.includes(needle)) return true;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  return regex.test(text);
}

function domainEqualsOrSubdomain(domain: string, profileDomain: string) {
  const normalizedDomain = domain.toLowerCase();
  const normalizedProfileDomain = profileDomain.toLowerCase();
  return (
    normalizedDomain === normalizedProfileDomain ||
    normalizedDomain.endsWith(`.${normalizedProfileDomain}`)
  );
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
