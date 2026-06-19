import { describe, it, expect } from "vitest";
import { normalizeRange } from "./metrics.const";

describe("normalizeRange", () => {
  it("accepts a number followed by a valid unit and normalizes it", () => {
    expect(normalizeRange("15m")).toBe("15m");
    expect(normalizeRange("6h")).toBe("6h");
    expect(normalizeRange("7d")).toBe("7d");
  });

  it("trims, lowercases, and collapses whitespace between number and unit", () => {
    expect(normalizeRange("  24H ")).toBe("24h");
    expect(normalizeRange("3 D")).toBe("3d");
  });

  it("accepts a decimal value", () => {
    expect(normalizeRange("1.5h")).toBe("1.5h");
  });

  it("rejects zero, negative, and non-positive values", () => {
    expect(normalizeRange("0m")).toBeNull();
    expect(normalizeRange("0.0h")).toBeNull();
  });

  it("rejects an invalid unit or malformed input", () => {
    expect(normalizeRange("10s")).toBeNull();
    expect(normalizeRange("abc")).toBeNull();
    expect(normalizeRange("")).toBeNull();
    expect(normalizeRange("h")).toBeNull();
  });
});
