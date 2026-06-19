import { describe, it, expect } from "vitest";
import {
  Tree,
  KubeResource,
  Deployment,
  Node,
  GitRepository,
  OCIRepository,
  HelmRelease,
  Condition,
  PodLog,
} from "./tree";
import { makeDto } from "../../../test/fixtures";

describe("Tree.getFluxControllersDeployments", () => {
  it("returns only Deployments in the flux-system namespace, sorted by name", () => {
    const root = new KubeResource(makeDto({ kind: "Cluster" }));
    root.children = [
      new Deployment(makeDto({ kind: "Deployment", namespace: "flux-system", name: "source-controller" })),
      new Deployment(makeDto({ kind: "Deployment", namespace: "flux-system", name: "helm-controller" })),
      new Deployment(makeDto({ kind: "Deployment", namespace: "default", name: "app" })),
      new KubeResource(makeDto({ kind: "Pod", namespace: "flux-system", name: "x" })),
    ];

    const ctrls = new Tree(root).getFluxControllersDeployments();

    expect(ctrls.map((c) => c.name)).toEqual(["helm-controller", "source-controller"]);
  });
});

describe("Tree.traverse", () => {
  const tree = () => {
    const root = new KubeResource(makeDto({ uid: "root", kind: "Cluster" }));
    const a = new KubeResource(makeDto({ uid: "a" }));
    const b = new KubeResource(makeDto({ uid: "b" }));
    a.children = [b];
    root.children = [a];
    return { root, a, b };
  };

  it("visits each node with an increasing layer index", () => {
    const { root } = tree();
    const seen: Array<[string, number]> = [];
    new Tree(root).traverse(root, (n, layer) => {
      seen.push([n.uid, layer]);
      return false;
    });
    expect(seen).toEqual([["root", 0], ["a", 1], ["b", 2]]);
  });

  it("stops descending a branch when the callback returns true", () => {
    const { root } = tree();
    const seen: string[] = [];
    new Tree(root).traverse(root, (n) => {
      seen.push(n.uid);
      return n.uid === "a"; // skip a's children
    });
    expect(seen).toEqual(["root", "a"]);
  });

  it("does not revisit a node reachable by multiple paths", () => {
    const root = new KubeResource(makeDto({ uid: "root" }));
    const shared = new KubeResource(makeDto({ uid: "shared" }));
    const mid = new KubeResource(makeDto({ uid: "mid" }));
    mid.children = [shared];
    root.children = [shared, mid];

    const seen: string[] = [];
    new Tree(root).traverse(root, (n) => {
      seen.push(n.uid);
      return false;
    });
    expect(seen.filter((u) => u === "shared")).toHaveLength(1);
  });
});

describe("KubeResource no-arg constructor", () => {
  it("produces an empty, UNKNOWN-status resource", () => {
    const r = new KubeResource();
    expect(r.uid).toBe("");
    expect(r.name).toBe("");
    expect(r.labels.size).toBe(0);
    expect(r.annotations.size).toBe(0);
    expect(r.parentIDs).toEqual([]);
    expect(r.createdAt).toBeInstanceOf(Date);
  });

  it("exposes its group and kind via the groupKind getter", () => {
    const r = new KubeResource(makeDto({ kind: "Node", group: "longhorn.io" }));
    expect(r.groupKind).toEqual({ group: "longhorn.io", kind: "Node" });
  });
});

describe("Node.isReady", () => {
  const node = (status: "True" | "False") =>
    new Node(
      makeDto({
        kind: "Node",
        conditions: [
          { type: "Ready", status, message: "", reason: "", lastTransitionTime: "2026-01-01T00:00:00Z" },
        ],
      }),
    );

  it("is true when the Ready condition is True", () => {
    expect(node("True").isReady).toBe(true);
  });

  it("is false when the Ready condition is False", () => {
    expect(node("False").isReady).toBe(false);
  });

  it("is false when there is no Ready condition", () => {
    expect(new Node(makeDto({ kind: "Node" })).isReady).toBe(false);
  });
});

describe("GitRepository.getCode remaining precedence", () => {
  const make = (meta: Partial<Record<string, string>>) =>
    new GitRepository(
      makeDto({
        gitRepositoryMetadata: { url: "", branch: "", tag: "", semver: "", name: "", commit: "", ...meta },
      }),
    );

  it("uses semver when only semver is set", () => {
    expect(make({ semver: ">=1.0.0" }).getCode()).toBe(":>=1.0.0");
  });

  it("uses name as a last resort", () => {
    expect(make({ name: "repo" }).getCode()).toBe(":repo");
  });

  it("returns the url from getURL", () => {
    expect(make({ url: "https://x/repo.git" }).getURL()).toBe("https://x/repo.git");
  });
});

describe("OCIRepository.getCode remaining precedence", () => {
  const make = (meta: Partial<Record<string, string>>) =>
    new OCIRepository(
      makeDto({
        ociRepositoryMetadata: { url: "", digest: "", tag: "", semver: "", semverFilter: "", ...meta },
      }),
    );

  it("prefers tag over semver/filter", () => {
    expect(make({ tag: "v2", semver: "*" }).getCode()).toBe(":v2");
  });

  it("uses semver when there is no digest or tag", () => {
    expect(make({ semver: "1.x" }).getCode()).toBe(":1.x");
  });

  it("uses semverFilter as a last resort", () => {
    expect(make({ semverFilter: ">=1" }).getCode()).toBe(":>=1");
  });

  it("returns empty when nothing is set", () => {
    expect(make({}).getCode()).toBe("");
    expect(make({}).getURL()).toBe("");
  });
});

describe("HelmRelease", () => {
  it("captures its metadata when present and null otherwise", () => {
    const withMeta = new HelmRelease(
      makeDto({
        kind: "HelmRelease",
        helmReleaseMetadata: { chartName: "app", chartVersion: "1.0.0", sourceRef: { kind: "HelmRepository", name: "repo" } },
      }),
    );
    expect(withMeta.metadata?.chartName).toBe("app");
    expect(new HelmRelease(makeDto({ kind: "HelmRelease" })).metadata).toBeNull();
  });
});

describe("Condition", () => {
  it("treats only the string 'True' as a positive status", () => {
    const t = new Condition({ type: "Ready", status: "True", message: "ok", reason: "R", lastTransitionTime: "2026-01-01T00:00:00Z" });
    const f = new Condition({ type: "Ready", status: "False", message: "no", reason: "R", lastTransitionTime: "2026-01-01T00:00:00Z" });
    expect(t.status).toBe(true);
    expect(f.status).toBe(false);
    expect(t.lastTransitionTime).toBeInstanceOf(Date);
  });
});

describe("PodLog", () => {
  it("builds from a DTO, parsing the timestamp", () => {
    const log = PodLog.fromDto({ uid: "u", log: "hello", timestamp: "2026-01-01T00:00:00Z", container: "main" });
    expect(log.log).toBe("hello");
    expect(log.container).toBe("main");
    expect(log.timestamp).toBeInstanceOf(Date);
  });
});
