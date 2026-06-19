import { describe, it, expect } from "vitest";
import {
  colorByStatus,
  colorByEventStatus,
  statusText,
  statusDotClass,
  statusChipColor,
  STATUS_BUCKETS,
  conditionDotClass,
} from "./helpers";
import { Condition, ResourceStatus } from "../../core/fluxTree/models/tree";

const cond = (over: Partial<{ type: string; status: boolean; reason: string }>): Condition =>
  Object.assign(
    new Condition({ type: "", status: "True", message: "", reason: "", lastTransitionTime: "2026-01-01T00:00:00Z" }),
    over,
  );

describe("colorByStatus", () => {
  it("maps each status to its semantic colour", () => {
    expect(colorByStatus(ResourceStatus.SUCCESS)).toBe("success");
    expect(colorByStatus(ResourceStatus.FAILED)).toBe("danger");
    expect(colorByStatus(ResourceStatus.PENDING)).toBe("warning");
    expect(colorByStatus(ResourceStatus.WARNING)).toBe("warning");
    expect(colorByStatus(ResourceStatus.SUSPENDED)).toBe("default");
    expect(colorByStatus(ResourceStatus.UNKNOWN)).toBe("default");
  });
});

describe("colorByEventStatus", () => {
  it("maps Normal to primary and Warning to warning", () => {
    expect(colorByEventStatus("Normal")).toBe("primary");
    expect(colorByEventStatus("Warning")).toBe("warning");
  });

  it("falls back to primary for unexpected values", () => {
    expect(colorByEventStatus("other" as never)).toBe("primary");
  });
});

describe("statusText", () => {
  it("renders human labels including the reconciling alias for warning", () => {
    expect(statusText(ResourceStatus.SUCCESS)).toBe("Ready");
    expect(statusText(ResourceStatus.FAILED)).toBe("Not Ready");
    expect(statusText(ResourceStatus.PENDING)).toBe("Reconciling");
    expect(statusText(ResourceStatus.WARNING)).toBe("Reconciling");
    expect(statusText(ResourceStatus.SUSPENDED)).toBe("Suspended");
    expect(statusText(ResourceStatus.UNKNOWN)).toBe("Unknown");
  });
});

describe("statusDotClass", () => {
  it("returns the bg-* class per status with a muted default", () => {
    expect(statusDotClass(ResourceStatus.SUCCESS)).toBe("bg-success");
    expect(statusDotClass(ResourceStatus.FAILED)).toBe("bg-danger");
    expect(statusDotClass(ResourceStatus.PENDING)).toBe("bg-warning");
    expect(statusDotClass(ResourceStatus.WARNING)).toBe("bg-warning");
    expect(statusDotClass(ResourceStatus.SUSPENDED)).toBe("bg-default-400");
  });
});

describe("statusChipColor", () => {
  it("groups warning and pending under warning", () => {
    expect(statusChipColor(ResourceStatus.FAILED)).toBe("danger");
    expect(statusChipColor(ResourceStatus.WARNING)).toBe("warning");
    expect(statusChipColor(ResourceStatus.PENDING)).toBe("warning");
    expect(statusChipColor(ResourceStatus.SUCCESS)).toBe("success");
    expect(statusChipColor(ResourceStatus.SUSPENDED)).toBe("default");
  });
});

describe("STATUS_BUCKETS matchers", () => {
  const bucket = (label: string) => STATUS_BUCKETS.find((b) => b.label === label)!;

  it("Not Ready captures both failed and warning", () => {
    expect(bucket("Not Ready").matches(ResourceStatus.FAILED)).toBe(true);
    expect(bucket("Not Ready").matches(ResourceStatus.WARNING)).toBe(true);
    expect(bucket("Not Ready").matches(ResourceStatus.SUCCESS)).toBe(false);
  });

  it("each other bucket matches exactly its status", () => {
    expect(bucket("Ready").matches(ResourceStatus.SUCCESS)).toBe(true);
    expect(bucket("Reconciling").matches(ResourceStatus.PENDING)).toBe(true);
    expect(bucket("Suspended").matches(ResourceStatus.SUSPENDED)).toBe(true);
    expect(bucket("Ready").matches(ResourceStatus.FAILED)).toBe(false);
  });
});

describe("conditionDotClass", () => {
  it("colours a success-type condition by its boolean status", () => {
    expect(conditionDotClass(cond({ type: "Ready", status: true }))).toBe("bg-success");
    expect(conditionDotClass(cond({ type: "Ready", status: false }))).toBe("bg-danger");
  });

  it("treats an error-type condition as danger regardless of status", () => {
    expect(conditionDotClass(cond({ type: "Failed", status: true }))).toBe("bg-danger");
  });

  it("falls back to reason classification for unknown types", () => {
    expect(conditionDotClass(cond({ type: "Custom", reason: "BuildFailed" }))).toBe("bg-danger");
    expect(conditionDotClass(cond({ type: "Custom", reason: "Progressing" }))).toBe("bg-warning");
    expect(conditionDotClass(cond({ type: "Custom", reason: "Succeeded" }))).toBe("bg-success");
  });

  it("returns the muted default when nothing matches", () => {
    expect(conditionDotClass(cond({ type: "Custom", reason: "Whatever" }))).toBe("bg-default-400");
  });
});
