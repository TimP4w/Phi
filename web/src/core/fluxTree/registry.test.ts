import { describe, it, expect } from "vitest";
import { lookupCtor, lookupIcon } from "./registry";
import { KubeResource, Kustomization, Node, LonghornNode } from "./models/tree";
import { makeDto } from "../../test/fixtures";

describe("lookupCtor", () => {
  it("resolves a registered GroupKind to its model constructor", () => {
    const ctor = lookupCtor({ group: "kustomize.toolkit.fluxcd.io", kind: "Kustomization" });
    expect(ctor).toBeDefined();
    expect(ctor!(makeDto({ kind: "Kustomization" }))).toBeInstanceOf(Kustomization);
  });

  it("disambiguates the same kind across different groups", () => {
    const core = lookupCtor({ group: "", kind: "Node" });
    const longhorn = lookupCtor({ group: "longhorn.io", kind: "Node" });
    expect(core!(makeDto({ kind: "Node" }))).toBeInstanceOf(Node);
    expect(longhorn!(makeDto({ kind: "Node", group: "longhorn.io" }))).toBeInstanceOf(LonghornNode);
  });

  it("returns undefined for an unregistered kind", () => {
    expect(lookupCtor({ kind: "Unicorn" })).toBeUndefined();
  });
});

describe("lookupIcon", () => {
  it("returns an icon node for a kind registered with one", () => {
    expect(lookupIcon({ group: "", kind: "Pod" })).toBeDefined();
  });

  it("returns undefined for a kind with no icon", () => {
    expect(lookupIcon({ kind: "Unicorn" })).toBeUndefined();
  });
});

describe("KubeResource.fromDto (registry-backed)", () => {
  it("builds the registered subclass for a known kind", () => {
    const r = KubeResource.fromDto(makeDto({ kind: "Kustomization", group: "kustomize.toolkit.fluxcd.io" }));
    expect(r).toBeInstanceOf(Kustomization);
  });

  it("falls back to the base KubeResource for an unknown kind", () => {
    const r = KubeResource.fromDto(makeDto({ kind: "Unicorn" }));
    expect(r).toBeInstanceOf(KubeResource);
    expect(r.constructor).toBe(KubeResource);
  });
});
