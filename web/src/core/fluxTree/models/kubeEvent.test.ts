import { describe, it, expect } from "vitest";
import { KubeEvent } from "./kubeEvent";
import { EventDto } from "./dtos/eventDto";

const dto = (over: Partial<EventDto> = {}): EventDto => ({
  uid: "e1",
  kind: "Pod",
  name: "web",
  namespace: "default",
  reason: "Started",
  message: "msg",
  source: "kubelet",
  type: "Normal",
  firstObserved: "2026-01-01T00:00:00Z" as unknown as Date,
  lastObserved: "2026-01-01T01:00:00Z" as unknown as Date,
  count: 1,
  resourceUID: "res-1",
  ...over,
});

describe("KubeEvent", () => {
  it("copies fields and parses timestamps into Dates", () => {
    const e = new KubeEvent(dto());
    expect(e.uid).toBe("e1");
    expect(e.firstObserved).toBeInstanceOf(Date);
    expect(e.lastObserved).toBeInstanceOf(Date);
    expect(e.type).toBe("Normal");
  });

  it("normalises any non-Normal type to Warning", () => {
    expect(new KubeEvent(dto({ type: "Warning" })).type).toBe("Warning");
    expect(new KubeEvent(dto({ type: "Weird" as never })).type).toBe("Warning");
  });
});
