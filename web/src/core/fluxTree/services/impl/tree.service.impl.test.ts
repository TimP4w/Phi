import { describe, it, expect, vi } from "vitest";
import { TreeServiceImpl } from "./tree.service.impl";
import type { HttpService } from "../../../http/services/http.service";
import { KubeEvent } from "../../models/kubeEvent";
import { EventDto } from "../../models/dtos/eventDto";

describe("TreeServiceImpl", () => {
  it("fetches events and maps each DTO into a KubeEvent", async () => {
    const dto: EventDto = {
      uid: "e1", kind: "Pod", name: "p", namespace: "ns", reason: "R",
      message: "m", source: "s", type: "Normal",
      firstObserved: "2026-01-01T00:00:00Z" as unknown as Date,
      lastObserved: "2026-01-01T00:00:00Z" as unknown as Date,
      count: 1, resourceUID: "r1",
    };
    const http = {
      get: vi.fn().mockResolvedValue([dto]),
      getYAML: vi.fn(), post: vi.fn(), patch: vi.fn(),
    } satisfies HttpService;

    const events = await new TreeServiceImpl(http).getEvents();

    expect(http.get).toHaveBeenCalledWith("/api/events");
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(KubeEvent);
    expect(events[0].firstObserved).toBeInstanceOf(Date);
  });
});
