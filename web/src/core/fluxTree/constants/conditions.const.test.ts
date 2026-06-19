import { describe, it, expect } from "vitest";
import { isContainerErrorReason } from "./conditions.const";

describe("isContainerErrorReason", () => {
  it("is true for known fatal container waiting reasons", () => {
    expect(isContainerErrorReason("CrashLoopBackOff")).toBe(true);
    expect(isContainerErrorReason("ImagePullBackOff")).toBe(true);
  });

  it("is false for transient or unknown reasons", () => {
    expect(isContainerErrorReason("ContainerCreating")).toBe(false);
    expect(isContainerErrorReason("PodInitializing")).toBe(false);
  });

  it("is false for a missing reason", () => {
    expect(isContainerErrorReason(undefined)).toBe(false);
    expect(isContainerErrorReason("")).toBe(false);
  });
});
