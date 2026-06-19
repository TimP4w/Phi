import { describe, it, expect, vi, beforeEach } from "vitest";

import { FetchEventsUseCase } from "./FetchEvents.usecase";
import { EventsStore } from "../stores/events.store";
import type { TreeService } from "../services/tree.service";
import { KubeEvent } from "../models/kubeEvent";
import type { Notifier } from "../../shared/notifier";

let notifier: Notifier & { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
beforeEach(() => {
  notifier = { success: vi.fn(), error: vi.fn() };
});

describe("FetchEventsUseCase", () => {
  it("loads events into the store and returns them", async () => {
    const store = new EventsStore();
    const events = [Object.assign(Object.create(KubeEvent.prototype), { uid: "e1" })] as KubeEvent[];
    const treeSvc: TreeService = { getEvents: vi.fn().mockResolvedValue(events) };

    const out = await new FetchEventsUseCase(store, treeSvc, notifier).execute();

    expect(out).toBe(events);
    expect(store.events).toEqual(events);
  });

  it("notifies and rejects when the fetch fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new EventsStore();
    const treeSvc: TreeService = { getEvents: vi.fn().mockRejectedValue(new Error("boom")) };

    await expect(new FetchEventsUseCase(store, treeSvc, notifier).execute()).rejects.toThrow("boom");
    expect(notifier.error).toHaveBeenCalledWith("Failed to fetch events");
  });
});
