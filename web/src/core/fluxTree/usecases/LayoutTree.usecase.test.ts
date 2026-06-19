import { describe, it, expect } from "vitest";
import { LayoutTreeUseCase } from "./LayoutTree.usecase";
import { FluxTreeStore } from "../stores/fluxTree.store";
import { makeDto } from "../../../test/fixtures";
import { FLUX_NAMESPACE } from "../constants/resources.const";

const storeWithTree = () => {
  const s = new FluxTreeStore();
  s.syncResources([
    makeDto({ uid: "root", kind: "Kustomization", group: "kustomize.toolkit.fluxcd.io", name: FLUX_NAMESPACE, namespace: FLUX_NAMESPACE }),
    makeDto({ uid: "deploy", kind: "Deployment", group: "apps", parentIDs: ["root"] }),
    makeDto({ uid: "pod", kind: "Pod", parentIDs: ["deploy"] }),
    makeDto({ uid: "cm", kind: "ConfigMap", parentIDs: ["root"] }),
  ]);
  return s;
};

describe("LayoutTreeUseCase.execute", () => {
  it("produces a positioned node per resource and typed edges", async () => {
    const store = storeWithTree();
    const { nodes, edges } = await new LayoutTreeUseCase(store).execute({ nodeId: "root" });

    expect(nodes.map((n) => n.id).sort()).toEqual(["cm", "deploy", "pod", "root"]);
    // Node types are derived from kind.
    expect(nodes.find((n) => n.id === "deploy")?.type).toBe("deployment");
    expect(nodes.find((n) => n.id === "pod")?.type).toBe("pod");
    expect(nodes.find((n) => n.id === "cm")?.type).toBe("resource");
    // Every node has a layout position.
    nodes.forEach((n) => expect(n.position).toEqual({ x: expect.any(Number), y: expect.any(Number) }));
    // Edges connect parents to children.
    expect(edges.some((e) => e.source === "root" && e.target === "deploy")).toBe(true);
    expect(edges.some((e) => e.source === "deploy" && e.target === "pod")).toBe(true);
  });

  it("falls back to the tree root when the nodeId is unknown", async () => {
    const store = storeWithTree();
    const { nodes } = await new LayoutTreeUseCase(store).execute({ nodeId: "does-not-exist" });
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("relayout repositions a given set of nodes and edges", async () => {
    const store = storeWithTree();
    const uc = new LayoutTreeUseCase(store);
    const first = await uc.execute({ nodeId: "root" });
    const relaid = await uc.relayout(first.nodes, first.edges);
    expect(relaid.nodes).toHaveLength(first.nodes.length);
    relaid.nodes.forEach((n) => expect(n.position).toEqual({ x: expect.any(Number), y: expect.any(Number) }));
  });
});
