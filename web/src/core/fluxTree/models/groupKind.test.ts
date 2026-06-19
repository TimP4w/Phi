import { describe, it, expect } from "vitest";
import { groupKindKey } from "./groupKind";

describe("groupKindKey", () => {
  it("returns just the kind for core (group-less) resources", () => {
    expect(groupKindKey({ kind: "Pod" })).toBe("Pod");
    expect(groupKindKey({ group: "", kind: "Node" })).toBe("Node");
  });

  it("joins kind and group with a dot for grouped resources", () => {
    expect(groupKindKey({ group: "longhorn.io", kind: "Node" })).toBe("Node.longhorn.io");
  });
});
