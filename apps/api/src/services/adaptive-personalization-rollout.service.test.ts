import assert from "node:assert/strict";
import test from "node:test";
import { AdaptivePersonalizationRolloutService } from "./adaptive-personalization-rollout.service";

test("global kill switch disables all adaptive personalization layers", () => {
  const service = new AdaptivePersonalizationRolloutService({
    env: {
      LCB_ADAPTIVE_PERSONALIZATION_ENABLED: "false",
      LCB_ADAPTIVE_PROFILE_INFERENCE_ENABLED: "true",
      LCB_ADAPTIVE_TODAY_RANKING_ENABLED: "true",
      LCB_ADAPTIVE_MESSAGE_STYLE_ENABLED: "true",
      LCB_ADAPTIVE_REMINDER_TUNING_ENABLED: "true",
      LCB_ADAPTIVE_DEBUG_METADATA_ENABLED: "true"
    }
  });

  const state = service.getUserRolloutState("user_1");
  assert.equal(state.reason, "GLOBAL_DISABLED");
  assert.equal(state.profileInferenceEnabled, false);
  assert.equal(state.todayPersonalizationEnabled, false);
  assert.equal(state.rankingEnabled, false);
  assert.equal(state.messagingEnabled, false);
  assert.equal(state.reminderTuningEnabled, false);
  assert.equal(state.debugMetadataEnabled, false);
});

test("layer toggles stay deterministic inside full rollout", () => {
  const service = new AdaptivePersonalizationRolloutService({
    env: {
      LCB_ADAPTIVE_PERSONALIZATION_ENABLED: "true",
      LCB_ADAPTIVE_PERSONALIZATION_ROLLOUT_PERCENT: "100",
      LCB_ADAPTIVE_PROFILE_INFERENCE_ENABLED: "true",
      LCB_ADAPTIVE_TODAY_RANKING_ENABLED: "false",
      LCB_ADAPTIVE_MESSAGE_STYLE_ENABLED: "true",
      LCB_ADAPTIVE_REMINDER_TUNING_ENABLED: "false",
      LCB_ADAPTIVE_DEBUG_METADATA_ENABLED: "false"
    }
  });

  const state = service.getUserRolloutState("user_2");

  assert.equal(state.inRolloutCohort, true);
  assert.equal(state.profileInferenceEnabled, true);
  assert.equal(state.todayPersonalizationEnabled, true);
  assert.equal(state.rankingEnabled, false);
  assert.equal(state.messagingEnabled, true);
  assert.equal(state.reminderTuningEnabled, false);
  assert.equal(state.debugMetadataEnabled, false);
  assert.equal(state.reason, "ENABLED");
});

test("outside rollout users get baseline today behavior while inference can still run", () => {
  const service = new AdaptivePersonalizationRolloutService({
    env: {
      LCB_ADAPTIVE_PERSONALIZATION_ENABLED: "true",
      LCB_ADAPTIVE_PERSONALIZATION_ROLLOUT_PERCENT: "0",
      LCB_ADAPTIVE_PROFILE_INFERENCE_ENABLED: "true",
      LCB_ADAPTIVE_TODAY_RANKING_ENABLED: "true",
      LCB_ADAPTIVE_MESSAGE_STYLE_ENABLED: "true",
      LCB_ADAPTIVE_REMINDER_TUNING_ENABLED: "true",
      LCB_ADAPTIVE_DEBUG_METADATA_ENABLED: "true"
    }
  });

  const state = service.getUserRolloutState("user_3");

  assert.equal(state.inRolloutCohort, false);
  assert.equal(state.profileInferenceEnabled, true);
  assert.equal(state.todayPersonalizationEnabled, false);
  assert.equal(state.rankingEnabled, false);
  assert.equal(state.messagingEnabled, false);
  assert.equal(state.reminderTuningEnabled, false);
  assert.equal(state.reason, "OUTSIDE_ROLLOUT");
});

test("percentage rollout assignment is stable for the same user", () => {
  const service = new AdaptivePersonalizationRolloutService({
    env: {
      LCB_ADAPTIVE_PERSONALIZATION_ENABLED: "true",
      LCB_ADAPTIVE_PERSONALIZATION_ROLLOUT_PERCENT: "37",
      LCB_ADAPTIVE_ROLLOUT_SALT: "stable-salt",
      LCB_ADAPTIVE_PROFILE_INFERENCE_ENABLED: "true",
      LCB_ADAPTIVE_TODAY_RANKING_ENABLED: "true",
      LCB_ADAPTIVE_MESSAGE_STYLE_ENABLED: "true",
      LCB_ADAPTIVE_REMINDER_TUNING_ENABLED: "true",
      LCB_ADAPTIVE_DEBUG_METADATA_ENABLED: "true"
    }
  });

  const first = service.getUserRolloutState("repeat_user");
  const second = service.getUserRolloutState("repeat_user");

  assert.equal(first.inRolloutCohort, second.inRolloutCohort);
  assert.equal(first.reason, second.reason);
});

test("missing user id disables adaptive personalization safely", () => {
  const service = new AdaptivePersonalizationRolloutService({
    env: {
      LCB_ADAPTIVE_PERSONALIZATION_ENABLED: "true",
      LCB_ADAPTIVE_PERSONALIZATION_ROLLOUT_PERCENT: "100"
    }
  });

  const state = service.getUserRolloutState("");
  assert.equal(state.reason, "NO_USER_ID");
  assert.equal(state.todayPersonalizationEnabled, false);
  assert.equal(state.profileInferenceEnabled, false);
});

test("in-cohort users with all presentation layers disabled return layer-disabled reason", () => {
  const service = new AdaptivePersonalizationRolloutService({
    env: {
      LCB_ADAPTIVE_PERSONALIZATION_ENABLED: "true",
      LCB_ADAPTIVE_PERSONALIZATION_ROLLOUT_PERCENT: "100",
      LCB_ADAPTIVE_PROFILE_INFERENCE_ENABLED: "true",
      LCB_ADAPTIVE_TODAY_RANKING_ENABLED: "false",
      LCB_ADAPTIVE_MESSAGE_STYLE_ENABLED: "false",
      LCB_ADAPTIVE_REMINDER_TUNING_ENABLED: "false",
      LCB_ADAPTIVE_DEBUG_METADATA_ENABLED: "false"
    }
  });

  const state = service.getUserRolloutState("user_layer_off");
  assert.equal(state.inRolloutCohort, true);
  assert.equal(state.todayPersonalizationEnabled, false);
  assert.equal(state.reason, "LAYER_DISABLED");
});
