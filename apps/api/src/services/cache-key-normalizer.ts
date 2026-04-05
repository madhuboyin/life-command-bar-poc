import crypto from "crypto";

export function normalizeCacheInput(value: unknown): string {
  return stableStringify(value);
}

export function hashNormalizedInput(value: unknown): string {
  return crypto.createHash("sha256").update(normalizeCacheInput(value)).digest("hex");
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    const output: Record<string, unknown> = {};
    for (const [key, entry] of entries) {
      output[key] = sortValue(entry);
    }
    return output;
  }

  return value;
}
