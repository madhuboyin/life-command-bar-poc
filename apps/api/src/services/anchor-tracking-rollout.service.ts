export type AnchorTrackingRolloutConfig = {
  step4Enabled: boolean;
  gmailEnrichmentEnabled: boolean;
  dedupeRefinementEnabled: boolean;
  timingRefinementEnabled: boolean;
  debugMetadataEnabled: boolean;
};

export type AnchorTrackingRolloutReason =
  | "GLOBAL_DISABLED"
  | "LAYER_DISABLED"
  | "ENABLED";

export type AnchorTrackingRolloutState = AnchorTrackingRolloutConfig & {
  reason: AnchorTrackingRolloutReason;
};

type Dependencies = {
  env?: NodeJS.ProcessEnv;
};

export class AnchorTrackingRolloutService {
  private readonly env: NodeJS.ProcessEnv;

  constructor(dependencies: Dependencies = {}) {
    this.env = dependencies.env ?? process.env;
  }

  getConfig(): AnchorTrackingRolloutConfig {
    return {
      step4Enabled: readBooleanEnv(this.env, "LCB_ANCHOR_STEP4_ENABLED", true),
      gmailEnrichmentEnabled: readBooleanEnv(
        this.env,
        "LCB_ANCHOR_GMAIL_ENRICHMENT_ENABLED",
        true
      ),
      dedupeRefinementEnabled: readBooleanEnv(
        this.env,
        "LCB_ANCHOR_DEDUPE_REFINEMENT_ENABLED",
        true
      ),
      timingRefinementEnabled: readBooleanEnv(
        this.env,
        "LCB_ANCHOR_TIMING_REFINEMENT_ENABLED",
        true
      ),
      debugMetadataEnabled: readBooleanEnv(
        this.env,
        "LCB_ANCHOR_DEBUG_METADATA_ENABLED",
        false
      )
    };
  }

  getState(): AnchorTrackingRolloutState {
    const config = this.getConfig();

    if (!config.step4Enabled) {
      return {
        step4Enabled: false,
        gmailEnrichmentEnabled: false,
        dedupeRefinementEnabled: false,
        timingRefinementEnabled: false,
        debugMetadataEnabled: false,
        reason: "GLOBAL_DISABLED"
      };
    }

    const layerEnabled =
      config.gmailEnrichmentEnabled ||
      config.dedupeRefinementEnabled ||
      config.timingRefinementEnabled;

    if (!layerEnabled) {
      return {
        ...config,
        reason: "LAYER_DISABLED"
      };
    }

    return {
      ...config,
      reason: "ENABLED"
    };
  }
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
