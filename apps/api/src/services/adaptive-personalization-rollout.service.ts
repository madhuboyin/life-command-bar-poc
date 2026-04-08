export type AdaptivePersonalizationRolloutConfig = {
  globalEnabled: boolean;
  rolloutPercent: number;
  profileInferenceEnabled: boolean;
  todayRankingEnabled: boolean;
  messagingEnabled: boolean;
  reminderTuningEnabled: boolean;
  debugMetadataEnabled: boolean;
  rolloutSalt: string;
};

export type AdaptivePersonalizationRolloutReason =
  | "GLOBAL_DISABLED"
  | "NO_USER_ID"
  | "OUTSIDE_ROLLOUT"
  | "LAYER_DISABLED"
  | "ENABLED";

export type AdaptivePersonalizationRolloutState = {
  userId: string | null;
  config: AdaptivePersonalizationRolloutConfig;
  inRolloutCohort: boolean;
  profileInferenceEnabled: boolean;
  todayPersonalizationEnabled: boolean;
  rankingEnabled: boolean;
  messagingEnabled: boolean;
  reminderTuningEnabled: boolean;
  debugMetadataEnabled: boolean;
  reason: AdaptivePersonalizationRolloutReason;
};

type ServiceDependencies = {
  env?: NodeJS.ProcessEnv;
};

export class AdaptivePersonalizationRolloutService {
  private readonly env: NodeJS.ProcessEnv;

  constructor(dependencies: ServiceDependencies = {}) {
    this.env = dependencies.env ?? process.env;
  }

  getConfig(): AdaptivePersonalizationRolloutConfig {
    return {
      globalEnabled: readBooleanEnv(
        this.env,
        "LCB_ADAPTIVE_PERSONALIZATION_ENABLED",
        true
      ),
      rolloutPercent: readPercentEnv(
        this.env,
        "LCB_ADAPTIVE_PERSONALIZATION_ROLLOUT_PERCENT",
        100
      ),
      profileInferenceEnabled: readBooleanEnv(
        this.env,
        "LCB_ADAPTIVE_PROFILE_INFERENCE_ENABLED",
        true
      ),
      todayRankingEnabled: readBooleanEnv(
        this.env,
        "LCB_ADAPTIVE_TODAY_RANKING_ENABLED",
        true
      ),
      messagingEnabled: readBooleanEnv(
        this.env,
        "LCB_ADAPTIVE_MESSAGE_STYLE_ENABLED",
        true
      ),
      reminderTuningEnabled: readBooleanEnv(
        this.env,
        "LCB_ADAPTIVE_REMINDER_TUNING_ENABLED",
        true
      ),
      debugMetadataEnabled: readBooleanEnv(
        this.env,
        "LCB_ADAPTIVE_DEBUG_METADATA_ENABLED",
        true
      ),
      rolloutSalt: readStringEnv(
        this.env,
        "LCB_ADAPTIVE_ROLLOUT_SALT",
        "lcb-adaptive-v1"
      )
    };
  }

  getUserRolloutState(userId: string | null | undefined): AdaptivePersonalizationRolloutState {
    const config = this.getConfig();
    const normalizedUserId =
      typeof userId === "string" && userId.trim().length > 0
        ? userId.trim()
        : null;

    if (!config.globalEnabled) {
      return {
        userId: normalizedUserId,
        config,
        inRolloutCohort: false,
        profileInferenceEnabled: false,
        todayPersonalizationEnabled: false,
        rankingEnabled: false,
        messagingEnabled: false,
        reminderTuningEnabled: false,
        debugMetadataEnabled: false,
        reason: "GLOBAL_DISABLED"
      };
    }

    if (!normalizedUserId) {
      return {
        userId: null,
        config,
        inRolloutCohort: false,
        profileInferenceEnabled: false,
        todayPersonalizationEnabled: false,
        rankingEnabled: false,
        messagingEnabled: false,
        reminderTuningEnabled: false,
        debugMetadataEnabled: false,
        reason: "NO_USER_ID"
      };
    }

    const inRolloutCohort = isInRolloutCohort({
      userId: normalizedUserId,
      rolloutPercent: config.rolloutPercent,
      salt: config.rolloutSalt
    });

    const profileInferenceEnabled = config.profileInferenceEnabled;
    const rankingEnabled = inRolloutCohort && config.todayRankingEnabled;
    const messagingEnabled = inRolloutCohort && config.messagingEnabled;
    const reminderTuningEnabled = inRolloutCohort && config.reminderTuningEnabled;
    const debugMetadataEnabled = inRolloutCohort && config.debugMetadataEnabled;

    const todayPersonalizationEnabled =
      rankingEnabled || messagingEnabled || reminderTuningEnabled;

    const reason: AdaptivePersonalizationRolloutReason = !inRolloutCohort
      ? "OUTSIDE_ROLLOUT"
      : todayPersonalizationEnabled
        ? "ENABLED"
        : "LAYER_DISABLED";

    return {
      userId: normalizedUserId,
      config,
      inRolloutCohort,
      profileInferenceEnabled,
      todayPersonalizationEnabled,
      rankingEnabled,
      messagingEnabled,
      reminderTuningEnabled,
      debugMetadataEnabled,
      reason
    };
  }
}

function isInRolloutCohort(input: {
  userId: string;
  rolloutPercent: number;
  salt: string;
}) {
  if (input.rolloutPercent <= 0) return false;
  if (input.rolloutPercent >= 100) return true;

  const hash = hashStringToUint32(`${input.salt}:${input.userId}`);
  const bucket = hash % 100;
  return bucket < input.rolloutPercent;
}

function hashStringToUint32(value: string) {
  // Deterministic FNV-1a hash for stable cohort assignment.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readBooleanEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: boolean
) {
  const raw = (env[key] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return fallback;
}

function readPercentEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number
) {
  const raw = (env[key] ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded <= 0) return 0;
  if (rounded >= 100) return 100;
  return rounded;
}

function readStringEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: string
) {
  const raw = (env[key] ?? "").trim();
  return raw.length > 0 ? raw : fallback;
}
