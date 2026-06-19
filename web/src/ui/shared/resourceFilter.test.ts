import { describe, it, expect } from "vitest";
import { subtreeHasMatch } from "./resourceFilter";
import { ResourceStatus } from "../../core/fluxTree/models/tree";
import { kubeResource, withChildren } from "../../test/fixtures";

describe("subtreeHasMatch", () => {
  it("matches everything when the filter is empty", () => {
    expect(subtreeHasMatch(kubeResource({}), { statuses: [], kinds: [] })).toBe(true);
  });

  it("matches a node on status and kind together", () => {
    const node = kubeResource({ kind: "Pod", status: "failed" });
    expect(subtreeHasMatch(node, { statuses: [ResourceStatus.FAILED], kinds: ["Pod"] })).toBe(true);
    expect(subtreeHasMatch(node, { statuses: [ResourceStatus.FAILED], kinds: ["Deployment"] })).toBe(false);
  });

  it("matches when a descendant matches even if the root does not", () => {
    const root = withChildren(kubeResource({ kind: "Cluster", status: "success" }), [
      withChildren(kubeResource({ kind: "Group", status: "success" }), [
        kubeResource({ kind: "Pod", status: "failed" }),
      ]),
    ]);
    expect(subtreeHasMatch(root, { statuses: [ResourceStatus.FAILED], kinds: [] })).toBe(true);
  });

  it("returns false when neither the node nor any descendant matches", () => {
    const root = withChildren(kubeResource({ kind: "Cluster", status: "success" }), [
      kubeResource({ kind: "Pod", status: "success" }),
    ]);
    expect(subtreeHasMatch(root, { statuses: [ResourceStatus.FAILED], kinds: [] })).toBe(false);
  });
});
