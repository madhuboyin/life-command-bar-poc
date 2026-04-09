import assert from "node:assert/strict";
import test from "node:test";
import { AnchorTrackingRolloutService } from "./anchor-tracking-rollout.service";

test("global step4 kill switch disables all anchor refinement layers", () => {
  const service = new AnchorTrackingRolloutService({
    env: {
      LCB_ANCHOR_STEP4_ENABLED: "false",
      LCB_ANCHOR_GMAIL_ENRICHMENT_ENABLED: "true",
      LCB_ANCHOR_DEDUPE_REFINEMENT_ENABLED: "true",
      LCB_ANCHOR_TIMING_REFINEMENT_ENABLED: "true"
    }
  });

  const state = service.getState();
  assert.equal(state.reason, "GLOBAL_DISABLED");
  assert.equal(state.step4Enabled, false);
  assert.equal(state.gmailEnrichmentEnabled, false);
  assert.equal(state.dedupeRefinementEnabled, false);
  assert.equal(state.timingRefinementEnabled, false);
});

test("layer disabled reason is returned when all step4 layers are off", () => {
  const service = new AnchorTrackingRolloutService({
    env: {
      LCB_ANCHOR_STEP4_ENABLED: "true",
      LCB_ANCHOR_GMAIL_ENRICHMENT_ENABLED: "false",
      LCB_ANCHOR_DEDUPE_REFINEMENT_ENABLED: "false",
      LCB_ANCHOR_TIMING_REFINEMENT_ENABLED: "false"
    }
  });

  const state = service.getState();
  assert.equal(state.reason, "LAYER_DISABLED");
});

test("enabled state preserves independent layer toggles", () => {
  const service = new AnchorTrackingRolloutService({
    env: {
      LCB_ANCHOR_STEP4_ENABLED: "true",
      LCB_ANCHOR_GMAIL_ENRICHMENT_ENABLED: "true",
      LCB_ANCHOR_DEDUPE_REFINEMENT_ENABLED: "false",
      LCB_ANCHOR_TIMING_REFINEMENT_ENABLED: "true",
      LCB_ANCHOR_DEBUG_METADATA_ENABLED: "true"
    }
  });

  const state = service.getState();
  assert.equal(state.reason, "ENABLED");
  assert.equal(state.gmailEnrichmentEnabled, true);
  assert.equal(state.dedupeRefinementEnabled, false);
  assert.equal(state.timingRefinementEnabled, true);
  assert.equal(state.debugMetadataEnabled, true);
});
