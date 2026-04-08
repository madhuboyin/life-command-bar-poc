type UserFacingCopyReplacement = {
  pattern: RegExp;
  replacement: string;
};

const USER_FACING_KEY_HINTS = [
  "title",
  "subtitle",
  "description",
  "summary",
  "message",
  "reason",
  "label",
  "context",
  "why",
  "note",
  "supporting",
  "primary",
  "headline",
  "caption",
  "insight",
  "explanation",
  "outcome",
  "cta",
  "empty",
  "placeholder"
] as const;

const USER_FACING_ARRAY_KEY_HINTS = ["signals", "reasons", "labels", "notes"] as const;

const SKIP_PATH_SEGMENTS = new Set([
  "metadata",
  "decisiontrace",
  "diagnostics",
  "debug",
  "internal",
  "rawdata"
]);

const BANNED_USER_JARGON_PATTERNS = [
  /\bdense admin cluster\b/i,
  /\bcognitive load score\b/i,
  /\bsignal conflict\b/i,
  /\blifecycle uncertain\b/i,
  /\bweighted priority\b/i,
  /\bobligation density\b/i,
  /\baggregation window\b/i,
  /\bactionability score\b/i,
  /\breview density\b/i,
  /\badministrative burden forecast\b/i,
  /\bprojected obligation pressure\b/i,
  /\bpredicted administrative concentration\b/i
];

const COPY_REPLACEMENTS: UserFacingCopyReplacement[] = [
  { pattern: /\bNo dense admin cluster is expected in this window\.?/gi, replacement: "Nothing heavy is coming up in this window." },
  { pattern: /\bUpcoming signals\b/g, replacement: "Upcoming items" },
  { pattern: /\bupcoming signals\b/g, replacement: "upcoming items" },
  { pattern: /\bUpcoming signal\b/g, replacement: "Upcoming item" },
  { pattern: /\bupcoming signal\b/g, replacement: "upcoming item" },
  { pattern: /\blow-signal\b/gi, replacement: "low-detail" },
  { pattern: /\bhigh-signal\b/gi, replacement: "clear" },
  { pattern: /\bcancellation signals? (?:is|are) strong\b/gi, replacement: "cancellation looks clear" },
  { pattern: /\bduplicate subscription signals were detected\b/gi, replacement: "this may be a duplicate subscription" },
  { pattern: /\bsignals? are still weak\b/gi, replacement: "we still need a bit more detail" },
  { pattern: /\bsignals? are stable\b/gi, replacement: "details look steady" },
  { pattern: /\bconflicting signals?\b/gi, replacement: "details don't line up yet" },
  { pattern: /\bsignal conflict\b/gi, replacement: "details don't line up yet" },
  { pattern: /\bsignal[s]? conflicted\b/gi, replacement: "details did not line up" },
  { pattern: /\bfuture signal\b/gi, replacement: "upcoming item" },
  { pattern: /\bsignals? were detected\b/gi, replacement: "details were found" },
  { pattern: /\bsignal did not meet trust thresholds\b/gi, replacement: "details were not clear enough" },
  { pattern: /\bno high-risk signals detected\b/gi, replacement: "Nothing risky stands out" },
  { pattern: /\bobligation intelligence signals?\b/gi, replacement: "recent activity" },
  { pattern: /\blifecycle timeline\b/gi, replacement: "timeline" },
  { pattern: /\blifecycle events?\b/gi, replacement: "status updates" },
  { pattern: /\blifecycle state\b/gi, replacement: "status" },
  { pattern: /\blifecycle evidence\b/gi, replacement: "recent updates" },
  { pattern: /\blifecycle\b/gi, replacement: "status" },
  { pattern: /\blow confidence prediction\b/gi, replacement: "not sure yet" },
  { pattern: /\bconflicting or low-confidence details\b/gi, replacement: "details that still need a quick check" },
  { pattern: /\bweak value or inactivity signals\b/gi, replacement: "light usage so far" },
  { pattern: /\bconfidence adjusted from \d+% to \d+%\.?/gi, replacement: "prediction was updated from your feedback." },
  { pattern: /\bprediction confidence updated from outcome feedback\.?/gi, replacement: "prediction was updated from your feedback." },
  { pattern: /\bprediction confidence reduced\b/gi, replacement: "prediction updated" },
  { pattern: /\bconfidence\s*\d+%/gi, replacement: "worth a quick check" },
  { pattern: /\brecurring patterns?\b/gi, replacement: "recurring history" },
  { pattern: /\bpatterns stabilize\b/gi, replacement: "things settle" }
];

export function hardenUserFacingResponseData<T>(value: T): T {
  return hardenValue(value, []) as T;
}

export function hardenUserFacingCopy(text: string): string {
  let output = text;
  for (const replacement of COPY_REPLACEMENTS) {
    output = output.replace(replacement.pattern, replacement.replacement);
  }
  return output.replace(/\s{2,}/g, " ").trim();
}

export function containsBannedUserJargon(text: string) {
  return BANNED_USER_JARGON_PATTERNS.some((pattern) => pattern.test(text));
}

function hardenValue(value: unknown, path: string[]): unknown {
  if (typeof value === "string") {
    return shouldHardenString(path) ? hardenUserFacingCopy(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => hardenArrayItem(item, path));
  }

  if (!value || typeof value !== "object" || value instanceof Date) {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const next: Record<string, unknown> = {};
  for (const [key, nested] of entries) {
    next[key] = hardenValue(nested, [...path, key]);
  }
  return next;
}

function hardenArrayItem(item: unknown, path: string[]) {
  const lastKey = path[path.length - 1]?.toLowerCase() ?? "";
  if (typeof item === "string" && shouldHardenArrayString(lastKey)) {
    return hardenUserFacingCopy(item.replace(/_/g, " "));
  }
  return hardenValue(item, path);
}

function shouldHardenString(path: string[]) {
  const normalizedPath = path.map((segment) => segment.toLowerCase());
  if (normalizedPath.some((segment) => SKIP_PATH_SEGMENTS.has(segment))) {
    return false;
  }

  const last = normalizedPath[normalizedPath.length - 1] ?? "";
  return USER_FACING_KEY_HINTS.some((hint) => last.includes(hint));
}

function shouldHardenArrayString(lastKey: string) {
  return USER_FACING_ARRAY_KEY_HINTS.some((hint) => lastKey.includes(hint));
}
