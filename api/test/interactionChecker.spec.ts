import { describe, expect, it } from "vitest";
import { checkInteractions } from "../src/services/interactionChecker.js";

describe("checkInteractions", () => {
  it("flags nothing for unrelated medications", () => {
    const result = checkInteractions(["ibuprofen", "vitamin d"]);
    expect(result.flagged).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it("flags the classic warfarin + aspirin bleeding-risk pair", () => {
    const result = checkInteractions(["warfarin", "aspirin"]);
    expect(result.flagged).toBe(true);
    expect(result.matches.some((m) => m.severity === "major")).toBe(true);
  });

  it("flags a contraindicated pair (sildenafil + nitroglycerin)", () => {
    const result = checkInteractions(["sildenafil", "nitroglycerin"]);
    expect(result.flagged).toBe(true);
    expect(result.matches[0]?.severity).toBe("contraindicated");
  });

  it("matches case-insensitively and with partial names", () => {
    const result = checkInteractions(["Warfarin", "Aspirin 81mg"]);
    expect(result.flagged).toBe(true);
  });

  it("finds multiple simultaneous interactions in a longer list", () => {
    const result = checkInteractions(["warfarin", "aspirin", "lithium", "hydrochlorothiazide"]);
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
  });

  it("always includes a source citation and disclaimer", () => {
    const result = checkInteractions(["a", "b"]);
    expect(result.source.length).toBeGreaterThan(0);
    expect(result.disclaimer.toLowerCase()).toContain("not a comprehensive clinical database");
  });
});
