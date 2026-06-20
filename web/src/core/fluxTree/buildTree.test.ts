import { describe, it, expect } from "vitest";
import { buildTree } from "./buildTree";
import { KubeResource } from "./models/tree";
import { makeDto } from "../../test/fixtures";
import { FLUX_NAMESPACE } from "./constants/resources.const";

function mapOf(...dtos: ReturnType<typeof makeDto>[]): Map<string, KubeResource> {
  const m = new Map<string, KubeResource>();
  for (const dto of dtos) m.set(dto.uid, KubeResource.fromDto(dto));
  return m;
}

const rootDto = () =>
  makeDto({
    uid: "root",
    kind: "Kustomization",
    group: "kustomize.toolkit.fluxcd.io",
    name: FLUX_NAMESPACE,
    namespace: FLUX_NAMESPACE,
  });

describe("buildTree", () => {
  it("wires children to parents and finds the flux-system root", () => {
    const tree = buildTree(
      mapOf(rootDto(), makeDto({ uid: "child", kind: "Pod", parentIDs: ["root"] })),
    );
    expect(tree.root.uid).toBe("root");
    expect(tree.root.children.map((c) => c.uid)).toEqual(["child"]);
  });

  it("skips self-referential parent edges", () => {
    const resources = mapOf(makeDto({ uid: "x", parentIDs: ["x"] }));
    buildTree(resources);
    expect(resources.get("x")?.children).toEqual([]);
  });

  it("keeps Trivy report resources out of the graph", () => {
    const tree = buildTree(
      mapOf(
        rootDto(),
        makeDto({
          uid: "report",
          parentIDs: ["root"],
          trivyMetadata: { reportType: "vulnerability", critical: 1 },
        }),
      ),
    );
    expect(tree.root.children).toHaveLength(0);
  });

  it("falls back to an empty root when no flux-system Kustomization exists", () => {
    const tree = buildTree(mapOf(makeDto({ uid: "a", kind: "Pod" })));
    expect(tree.root.uid).toBe("");
  });
});
