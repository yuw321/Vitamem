import { describe, it, expect } from "vitest";
import { PRESETS, PresetName } from "./presets.js";

describe("PRESETS", () => {
  const presetNames = Object.keys(PRESETS) as PresetName[];

  it("has all expected preset names", () => {
    expect(presetNames).toContain("daily-checkin");
    expect(presetNames).toContain("weekly-therapy");
    expect(presetNames).toContain("on-demand");
    expect(presetNames).toContain("long-term");
  });

  it("every preset has all three timeout values", () => {
    for (const name of presetNames) {
      const preset = PRESETS[name];
      expect(preset).toHaveProperty("coolingTimeoutMs");
      expect(preset).toHaveProperty("dormantTimeoutMs");
      expect(preset).toHaveProperty("closedTimeoutMs");
    }
  });

  it("all preset values are positive numbers", () => {
    for (const name of presetNames) {
      const preset = PRESETS[name];
      expect(preset.coolingTimeoutMs).toBeGreaterThan(0);
      expect(preset.dormantTimeoutMs).toBeGreaterThan(0);
      expect(preset.closedTimeoutMs).toBeGreaterThan(0);
    }
  });
});
