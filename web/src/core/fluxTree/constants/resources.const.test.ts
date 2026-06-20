import { describe, it, expect } from "vitest";
import { robustnessColor } from "./resources.const";

describe("robustnessColor", () => {
  it("maps each known Longhorn robustness value to a semantic colour", () => {
    expect(robustnessColor("healthy")).toBe("success");
    expect(robustnessColor("degraded")).toBe("warning");
    expect(robustnessColor("faulted")).toBe("danger");
  });

  it("falls back to default for unknown values", () => {
    expect(robustnessColor("unknown")).toBe("default");
    expect(robustnessColor("")).toBe("default");
  });
});
