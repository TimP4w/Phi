import { describe, it, expect } from "vitest";
import { EventsStore } from "./events.store";
import { KubeEvent } from "../models/kubeEvent";

const event = (over: Partial<KubeEvent> = {}): KubeEvent =>
  Object.assign(Object.create(KubeEvent.prototype), {
    uid: "e1",
    type: "Normal",
    resourceUID: "res-1",
    ...over,
  }) as KubeEvent;

describe("EventsStore", () => {
  it("adds a new event and flags new-events when the panel is closed", () => {
    const s = new EventsStore();
    s.addEvent(event({ uid: "e1" }));
    expect(s.events).toHaveLength(1);
    expect(s.hasNewEvents).toBe(true);
    expect(s.hasNewWarnings).toBe(false);
  });

  it("flags new warnings for a Warning event", () => {
    const s = new EventsStore();
    s.addEvent(event({ uid: "e1", type: "Warning" }));
    expect(s.hasNewWarnings).toBe(true);
  });

  it("replaces an existing event with the same uid rather than duplicating", () => {
    const s = new EventsStore();
    s.addEvent(event({ uid: "e1", message: "first" } as Partial<KubeEvent>));
    s.addEvent(event({ uid: "e1", message: "second" } as Partial<KubeEvent>));
    expect(s.events).toHaveLength(1);
    expect((s.events[0] as KubeEvent & { message: string }).message).toBe("second");
  });

  it("does not raise hints while the panel is open", () => {
    const s = new EventsStore();
    s.togglePanel(); // open
    s.addEvent(event({ uid: "e1", type: "Warning" }));
    expect(s.hasNewEvents).toBe(false);
    expect(s.hasNewWarnings).toBe(false);
  });

  it("clears hints when the panel is opened", () => {
    const s = new EventsStore();
    s.addEvent(event({ uid: "e1" })); // closed -> hint set
    s.togglePanel(); // open -> clears
    expect(s.hasNewEvents).toBe(false);
  });

  it("filters events by resource uid", () => {
    const s = new EventsStore();
    s.setEvents([event({ uid: "a", resourceUID: "r1" }), event({ uid: "b", resourceUID: "r2" })]);
    expect(s.eventsForResource("r1").map((e) => e.uid)).toEqual(["a"]);
  });

  it("clearEventsHint resets both flags", () => {
    const s = new EventsStore();
    s.addEvent(event({ uid: "e1", type: "Warning" }));
    s.clearEventsHint();
    expect(s.hasNewEvents).toBe(false);
    expect(s.hasNewWarnings).toBe(false);
  });
});
