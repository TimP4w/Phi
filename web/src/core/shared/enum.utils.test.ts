import { describe, it, expect } from "vitest";
import { isEnumValue } from "./enum.utils";

enum StringEnum {
  A = "a",
  B = "b",
}

enum NumericEnum {
  One = 1,
  Two = 2,
}

describe("isEnumValue", () => {
  it("returns true for a member of a string enum", () => {
    expect(isEnumValue(StringEnum, "a")).toBe(true);
    expect(isEnumValue(StringEnum, "b")).toBe(true);
  });

  it("returns false for a value outside a string enum", () => {
    expect(isEnumValue(StringEnum, "c")).toBe(false);
    expect(isEnumValue(StringEnum, "A")).toBe(false);
  });

  it("returns true for a member of a numeric enum", () => {
    expect(isEnumValue(NumericEnum, 1)).toBe(true);
  });

  it("returns false for nullish and mismatched-type values", () => {
    expect(isEnumValue(StringEnum, undefined)).toBe(false);
    expect(isEnumValue(StringEnum, null)).toBe(false);
    expect(isEnumValue(NumericEnum, "1")).toBe(false);
  });
});
