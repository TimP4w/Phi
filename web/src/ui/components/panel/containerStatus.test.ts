import { describe, it, expect } from "vitest";
import { containerStateColor } from "./containerStatus";
import { Container } from "../../../core/fluxTree/models/tree";

const container = (over: Partial<Container>): Container => ({
  name: "c",
  image: "img",
  ready: false,
  started: false,
  restartCount: 0,
  state: "Running",
  ...over,
});

describe("containerStateColor", () => {
  it("is danger for a fatal waiting reason", () => {
    expect(containerStateColor(container({ state: "Waiting", reason: "CrashLoopBackOff" }))).toBe("danger");
  });

  it("is danger for a non-zero terminated exit code", () => {
    expect(containerStateColor(container({ state: "Terminated", exitCode: 1 }))).toBe("danger");
  });

  it("is success for a running, ready container", () => {
    expect(containerStateColor(container({ state: "Running", ready: true }))).toBe("success");
  });

  it("is warning for a benign waiting state", () => {
    expect(containerStateColor(container({ state: "Waiting", reason: "ContainerCreating" }))).toBe("warning");
  });

  it("is default for a terminated container that exited cleanly", () => {
    expect(containerStateColor(container({ state: "Terminated", exitCode: 0 }))).toBe("default");
  });

  it("is default for a running but not-yet-ready container", () => {
    expect(containerStateColor(container({ state: "Running", ready: false }))).toBe("default");
  });
});
