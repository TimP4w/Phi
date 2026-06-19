import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HandleWsMessageUseCase } from "./handleWsMessage.usecase";
import { FluxTreeStore } from "../../fluxTree/stores/fluxTree.store";
import { EventsStore } from "../../fluxTree/stores/events.store";
import { MetricsStore } from "../../metrics/stores/metrics.store";
import { REALTIME_CONST } from "../constants/realtime.const";
import { makeDto } from "../../../test/fixtures";

const setup = () => {
  const flux = new FluxTreeStore();
  const events = new EventsStore();
  const metrics = new MetricsStore();
  const uc = new HandleWsMessageUseCase(flux, events, metrics);
  return { flux, events, metrics, uc };
};

describe("HandleWsMessageUseCase", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("syncs resources, dropping entries without a uid", async () => {
    const { flux, uc } = setup();
    const sync = vi.spyOn(flux, "syncResources");
    await uc.execute({ type: REALTIME_CONST.RESOURCE_SYNC, message: [makeDto({ uid: "a" }), { uid: "" }] });
    expect(sync).toHaveBeenCalledWith([expect.objectContaining({ uid: "a" })]);
  });

  it("ignores a non-array sync payload", async () => {
    const { flux, uc } = setup();
    const sync = vi.spyOn(flux, "syncResources");
    await uc.execute({ type: REALTIME_CONST.RESOURCE_SYNC, message: null });
    expect(sync).not.toHaveBeenCalled();
  });

  it("applies an upsert patch", async () => {
    const { flux, uc } = setup();
    const upsert = vi.spyOn(flux, "upsertResource");
    await uc.execute({ type: REALTIME_CONST.RESOURCE_PATCH, message: { op: "upsert", resource: makeDto({ uid: "a" }) } });
    expect(upsert).toHaveBeenCalled();
  });

  it("applies a delete patch", async () => {
    const { flux, uc } = setup();
    const remove = vi.spyOn(flux, "removeResource");
    await uc.execute({ type: REALTIME_CONST.RESOURCE_PATCH, message: { op: "delete", resource: makeDto({ uid: "a" }) } });
    expect(remove).toHaveBeenCalledWith("a");
  });

  it("ignores a patch with an unknown op", async () => {
    const { flux, uc } = setup();
    const upsert = vi.spyOn(flux, "upsertResource");
    await uc.execute({ type: REALTIME_CONST.RESOURCE_PATCH, message: { op: "nope" } });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("appends a log only when it targets the selected resource", async () => {
    const { flux, uc } = setup();
    flux.syncResources([makeDto({ uid: "pod" })]);
    flux.setSelectedResource(flux.findResourceByUid("pod")!);
    await uc.execute({ type: REALTIME_CONST.LOG, message: { uid: "pod", log: "l", timestamp: "t", container: "c" } });
    expect(flux.logsFor("pod")).toHaveLength(1);

    await uc.execute({ type: REALTIME_CONST.LOG, message: { uid: "other", log: "l", timestamp: "t", container: "c" } });
    expect(flux.logsFor("pod")).toHaveLength(1);
  });

  it("adds an incoming event to the events store", async () => {
    const { events, uc } = setup();
    await uc.execute({
      type: REALTIME_CONST.EVENT,
      message: { uid: "e1", type: "Warning", resourceUID: "r", firstObserved: "2026-01-01T00:00:00Z", lastObserved: "2026-01-01T00:00:00Z" },
    });
    expect(events.events).toHaveLength(1);
  });

  it("routes the various metrics messages to the metrics store", async () => {
    const { metrics, uc } = setup();
    const status = vi.spyOn(metrics, "applyStatus");
    const current = vi.spyOn(metrics, "applyCurrent");
    const storage = vi.spyOn(metrics, "applyStorage");
    const resource = vi.spyOn(metrics, "applyResource");
    const nodes = vi.spyOn(metrics, "applyNodes");

    await uc.execute({ type: REALTIME_CONST.METRICS_STATUS, message: { status: "active" } });
    await uc.execute({ type: REALTIME_CONST.METRICS_CURRENT, message: { usages: {} } });
    await uc.execute({ type: REALTIME_CONST.METRICS_STORAGE, message: { usages: {} } });
    await uc.execute({ type: REALTIME_CONST.METRICS_RESOURCE, message: { uid: "u", metrics: {} } });
    await uc.execute({ type: REALTIME_CONST.METRICS_NODES, message: [] });

    expect(status).toHaveBeenCalled();
    expect(current).toHaveBeenCalledWith({});
    expect(storage).toHaveBeenCalledWith({});
    expect(resource).toHaveBeenCalledWith("u", {});
    expect(nodes).toHaveBeenCalledWith([]);
  });

  it("skips a resource-metrics message without a uid", async () => {
    const { metrics, uc } = setup();
    const resource = vi.spyOn(metrics, "applyResource");
    await uc.execute({ type: REALTIME_CONST.METRICS_RESOURCE, message: {} });
    expect(resource).not.toHaveBeenCalled();
  });

  it("falls back to empty payloads for nullish metrics messages", async () => {
    const { metrics, uc } = setup();
    const current = vi.spyOn(metrics, "applyCurrent");
    const nodes = vi.spyOn(metrics, "applyNodes");
    await uc.execute({ type: REALTIME_CONST.METRICS_CURRENT, message: null });
    await uc.execute({ type: REALTIME_CONST.METRICS_NODES, message: null });
    expect(current).toHaveBeenCalledWith({});
    expect(nodes).toHaveBeenCalledWith([]);
  });

  it("ignores an unrecognised message type", async () => {
    const { uc } = setup();
    await expect(uc.execute({ type: "WHATEVER", message: {} })).resolves.toBeUndefined();
  });
});
