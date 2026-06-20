import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FluxTreeStore } from "./fluxTree.store";
import { ResourceStatus } from "../models/tree";
import { makeDto } from "../../../test/fixtures";
import { FLUX_NAMESPACE } from "../constants/resources.const";

describe("FluxTreeStore", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const rootKustomization = () =>
    makeDto({
      uid: "root",
      kind: "Kustomization",
      group: "kustomize.toolkit.fluxcd.io",
      name: FLUX_NAMESPACE,
      namespace: FLUX_NAMESPACE,
    });

  describe("syncResources + tree assembly", () => {
    it("wires children to parents via parentIDs and finds the flux-system root", () => {
      const s = new FluxTreeStore();
      s.syncResources([
        rootKustomization(),
        makeDto({ uid: "child", kind: "Pod", parentIDs: ["root"] }),
      ]);

      expect(s.root.uid).toBe("root");
      expect(s.root.children.map((c) => c.uid)).toEqual(["child"]);
      expect(s.resourceCount).toBe(2);
    });

    it("skips self-referential parent edges", () => {
      const s = new FluxTreeStore();
      s.syncResources([makeDto({ uid: "x", parentIDs: ["x"] })]);
      expect(s.findResourceByUid("x")?.children).toEqual([]);
    });

    it("falls back to an empty root when no flux-system Kustomization exists", () => {
      const s = new FluxTreeStore();
      s.syncResources([makeDto({ uid: "a", kind: "Pod" })]);
      expect(s.root.uid).toBe("");
    });

    it("keeps Trivy report resources out of the graph but in the map", () => {
      const s = new FluxTreeStore();
      s.syncResources([
        rootKustomization(),
        makeDto({ uid: "report", parentIDs: ["root"], trivyMetadata: { reportType: "vulnerability", critical: 1 } }),
      ]);
      expect(s.root.children).toHaveLength(0);
      expect(s.findResourceByUid("report")).toBeDefined();
      expect(s.trivyIndex).toBeInstanceOf(Map);
    });

    it("ignores DTOs without a uid", () => {
      const s = new FluxTreeStore();
      s.syncResources([makeDto({ uid: "" })]);
      expect(s.resourceCount).toBe(0);
    });
  });

  describe("upsert / remove with coalesced rebuild", () => {
    it("rebuilds the tree once the debounce window elapses", () => {
      const s = new FluxTreeStore();
      s.upsertResource(rootKustomization());
      s.upsertResource(makeDto({ uid: "child", kind: "Pod", parentIDs: ["root"] }));
      // Rebuild is scheduled, not yet run.
      expect(s.root.uid).toBe("");
      vi.runAllTimers();
      expect(s.root.uid).toBe("root");
      expect(s.root.children).toHaveLength(1);
    });

    it("ignores an upsert without a uid", () => {
      const s = new FluxTreeStore();
      s.upsertResource(makeDto({ uid: "" }));
      expect(s.resourceCount).toBe(0);
    });

    it("removes a resource and rebuilds", () => {
      const s = new FluxTreeStore();
      s.syncResources([rootKustomization(), makeDto({ uid: "child", parentIDs: ["root"] })]);
      s.removeResource("child");
      vi.runAllTimers();
      expect(s.findResourceByUid("child")).toBeUndefined();
    });
  });

  describe("selection and logs", () => {
    it("tracks the selected resource by uid", () => {
      const s = new FluxTreeStore();
      s.syncResources([makeDto({ uid: "a" })]);
      const a = s.findResourceByUid("a")!;
      s.setSelectedResource(a);
      expect(s.selectedResource?.uid).toBe("a");
      s.setSelectedResource(null);
      expect(s.selectedResource).toBeNull();
    });

    it("appends a log line to the selected resource", () => {
      const s = new FluxTreeStore();
      s.syncResources([makeDto({ uid: "a" })]);
      s.setSelectedResource(s.findResourceByUid("a")!);
      s.appendLog({ log: "hi", timestamp: new Date(), container: "main" } as never);
      expect(s.logsFor("a")).toHaveLength(1);
    });

    it("ignores a log when nothing is selected", () => {
      const s = new FluxTreeStore();
      expect(() => s.appendLog({ log: "x", timestamp: new Date(), container: "c" } as never)).not.toThrow();
    });
  });

  describe("computed collections and lookups", () => {
    const populated = () => {
      const s = new FluxTreeStore();
      s.syncResources([
        rootKustomization(),
        makeDto({ uid: "app-b", kind: "Kustomization", group: "kustomize.toolkit.fluxcd.io", name: "b-app", fluxRole: "application" }),
        makeDto({ uid: "app-a", kind: "HelmRelease", group: "helm.toolkit.fluxcd.io", name: "a-app", fluxRole: "application" }),
        makeDto({ uid: "repo", kind: "GitRepository", group: "source.toolkit.fluxcd.io", name: "repo", fluxRole: "repository" }),
        makeDto({ uid: "node", kind: "Node", name: "node-1" }),
      ]);
      return s;
    };

    it("returns applications sorted by name", () => {
      expect(populated().applications.map((a) => a.name)).toEqual(["a-app", "b-app"]);
    });

    it("returns repositories filtered by flux role", () => {
      expect(populated().repositories.map((r) => r.name)).toEqual(["repo"]);
    });

    it("returns core Nodes only", () => {
      expect(populated().nodes.map((n) => n.name)).toEqual(["node-1"]);
    });

    it("finds a Kustomization application by name", () => {
      expect(populated().findKustomizationByName("b-app")?.uid).toBe("app-b");
      expect(populated().findKustomizationByName("missing")).toBeNull();
      expect(populated().findKustomizationByName()).toBeNull();
    });

    it("finds a repository by name and kind, or by ref", () => {
      const s = populated();
      expect(s.findRepositoryByNameAndKind("repo", "GitRepository")?.uid).toBe("repo");
      expect(s.findRepositoryByNameAndKind("repo")).toBeNull();
      expect(s.findRepositoryByRef({ name: "repo", kind: "GitRepository" })?.uid).toBe("repo");
      expect(s.findRepositoryByRef()).toBeNull();
    });
  });

  describe("findFluxParents", () => {
    it("walks parentIDs upward collecting only Flux resources nearest-last", () => {
      const s = new FluxTreeStore();
      s.syncResources([
        makeDto({ uid: "ks", kind: "Kustomization", group: "kustomize.toolkit.fluxcd.io", name: FLUX_NAMESPACE, namespace: FLUX_NAMESPACE }),
        makeDto({ uid: "hr", kind: "HelmRelease", group: "helm.toolkit.fluxcd.io", parentIDs: ["ks"] }),
        makeDto({ uid: "pod", kind: "Pod", parentIDs: ["hr"] }),
      ]);

      expect(s.findFluxParents("pod").map((p) => p.uid)).toEqual(["ks", "hr"]);
    });

    it("returns an empty path for an unknown or missing uid", () => {
      const s = new FluxTreeStore();
      expect(s.findFluxParents()).toEqual([]);
      expect(s.findFluxParents("nope")).toEqual([]);
    });
  });

  it("exposes status via constructed resources", () => {
    const s = new FluxTreeStore();
    s.syncResources([makeDto({ uid: "a", status: "failed" })]);
    expect(s.findResourceByUid("a")?.status).toBe(ResourceStatus.FAILED);
  });

  describe("subtree walks", () => {
    const subtree = () => {
      const s = new FluxTreeStore();
      s.syncResources([
        makeDto({ uid: "root", kind: "Kustomization", hasMetrics: false }),
        makeDto({ uid: "deploy", kind: "Deployment", parentIDs: ["root"], hasMetrics: false }),
        makeDto({ uid: "pod", kind: "Pod", parentIDs: ["deploy"], hasMetrics: true }),
      ]);
      return s;
    };

    it("collects distinct kinds in the subtree, sorted", () => {
      expect(subtree().kindsInSubtree("root")).toEqual(["Deployment", "Kustomization", "Pod"]);
    });

    it("collects metric-bearing uids plus the root, sorted", () => {
      expect(subtree().metricsUidsInSubtree("root")).toEqual(["pod", "root"]);
    });

    it("returns an empty array for an unknown or missing uid", () => {
      const s = subtree();
      expect(s.kindsInSubtree()).toEqual([]);
      expect(s.metricsUidsInSubtree("nope")).toEqual([]);
    });
  });
});
