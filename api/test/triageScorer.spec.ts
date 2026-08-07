import { describe, expect, it } from "vitest";
import { scoreTriage } from "../src/services/triageScorer.js";

describe("scoreTriage", () => {
  it("flags nothing for a benign, unrelated sentence", () => {
    const result = scoreTriage("I'd like to schedule an annual checkup next month.");
    expect(result.score).toBe(0);
    expect(result.band).toBe("routine");
    expect(result.matchedFlags).toHaveLength(0);
  });

  it("flags a single mild symptom as low urgency", () => {
    const result = scoreTriage("I have a mild headache and a runny nose.");
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(10);
    expect(result.band).toBe("routine");
  });

  it("flags chest pain plus breathing difficulty as emergency", () => {
    const result = scoreTriage("Sudden crushing chest pain and I can't breathe.");
    expect(result.band).toBe("emergency");
    expect(result.matchedFlags).toContain("possible cardiac chest pain");
    expect(result.matchedFlags).toContain("respiratory distress");
  });

  it("flags stroke warning signs distinctly", () => {
    const result = scoreTriage("Sudden confusion and slurred speech since this morning.");
    expect(result.matchedFlags).toContain("possible stroke (FAST signs)");
    expect(result.band === "urgent" || result.band === "emergency").toBe(true);
  });

  it("caps the score at 100 even with many overlapping flags", () => {
    const result = scoreTriage(
      "Chest pain, can't breathe, face drooping, slurred speech, passed out, severe bleeding, suicidal, throat closing",
    );
    expect(result.score).toBe(100);
    expect(result.band).toBe("emergency");
  });

  it("always includes the non-diagnostic disclaimer", () => {
    const result = scoreTriage("anything");
    expect(result.disclaimer.toLowerCase()).toContain("not a diagnosis");
  });

  it("is case-insensitive", () => {
    const lower = scoreTriage("chest pain");
    const upper = scoreTriage("CHEST PAIN");
    expect(lower.score).toBe(upper.score);
  });
});
