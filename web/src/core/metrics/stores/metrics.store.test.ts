import { describe, it, expect } from "vitest";
import { MetricsStore } from "./metrics.store";
import { CurrentUsageDto, ResourceSpecDto } from "../models/dtos/metricsDto";

const spec = (): ResourceSpecDto => ({
  cpu: { requests: 100, limits: 200 },
  memory: { requests: 128, limits: 256 },
});

describe("MetricsStore.applyStatus", () => {
  it("marks prometheus active only for the active status", () => {
    const s = new MetricsStore();
    s.applyStatus({ name: "p", status: "active" });
    expect(s.prometheusActive).toBe(true);
    s.applyStatus({ name: "p", status: "unavailable" });
    expect(s.prometheusActive).toBe(false);
  });
});

describe("MetricsStore.applyCurrent", () => {
  it("stores usages, defaulting missing cpu/memory series to empty arrays", () => {
    const s = new MetricsStore();
    s.applyCurrent({
      uid1: { spec: spec() } as unknown as CurrentUsageDto,
    });
    const stored = s.currentUsage.get("uid1")!;
    expect(stored.cpu).toEqual([]);
    expect(stored.memory).toEqual([]);
  });
});

describe("MetricsStore.latestUsage", () => {
  it("returns undefined when there is no sample for the uid", () => {
    expect(new MetricsStore().latestUsage("missing")).toBeUndefined();
  });

  it("returns the last cpu/memory sample value plus the configured limits", () => {
    const s = new MetricsStore();
    s.applyCurrent({
      uid1: {
        cpu: [{ t: 1, v: 0.1 }, { t: 2, v: 0.5 }],
        memory: [{ t: 1, v: 100 }, { t: 2, v: 200 }],
        spec: spec(),
      },
    });

    expect(s.latestUsage("uid1")).toEqual({
      cpu: 0.5,
      memory: 200,
      cpuLimit: 200,
      memoryLimit: 256,
    });
  });

  it("reports undefined sample values when the series are empty", () => {
    const s = new MetricsStore();
    s.applyCurrent({ uid1: { cpu: [], memory: [], spec: spec() } });
    const latest = s.latestUsage("uid1")!;
    expect(latest.cpu).toBeUndefined();
    expect(latest.memory).toBeUndefined();
    expect(latest.cpuLimit).toBe(200);
  });
});

describe("MetricsStore other appliers", () => {
  it("stores storage usages", () => {
    const s = new MetricsStore();
    s.applyStorage({ uid1: { requested: 10, used: 5, pvcCount: 1, measured: 1 } });
    expect(s.storageUsage.get("uid1")?.used).toBe(5);
  });

  it("stores resource metrics, defaulting series to an empty object", () => {
    const s = new MetricsStore();
    s.applyResource("uid1", { range: "1h", spec: spec() } as never);
    expect(s.resourceMetrics.get("uid1")?.series).toEqual({});
  });

  it("replaces node usage wholesale", () => {
    const s = new MetricsStore();
    const nodes = [{ node: "n1", cpu: { used: 1, capacity: 2, percent: 50 }, memory: { used: 1, capacity: 2, percent: 50 } }];
    s.applyNodes(nodes);
    expect(s.nodeUsage).toBe(nodes);
  });
});
