import { KubeResource, Tree } from "./models/tree";
import { RESOURCE_TYPE, FLUX_NAMESPACE } from "./constants/resources.const";

// buildTree assembles the ownership graph from a flat resource map. Pure aside
// from (re)populating each resource's `children`, which is intrinsic to the model
// the rest of the UI traverses. Kept out of the store so it is unit-testable in
// isolation. See fluxTree.store for how rebuilds are scheduled/coalesced.
export function buildTree(resources: Map<string, KubeResource>): Tree {
  resources.forEach((resource) => {
    resource.children = [];
  });

  const childrenOf = new Map<string, KubeResource[]>();

  resources.forEach((resource) => {
    // Trivy report CRDs are a findings overlay, not graph nodes — keep them in
    // the resource map (for the findings index) but never attach them as children.
    if (resource.trivyMetadata) return;
    const parentId = resource.parentIDs[0];
    // Skip self-references and back-edges that would create cycles
    if (parentId && parentId !== resource.uid && resources.has(parentId)) {
      const siblings = childrenOf.get(parentId) ?? [];
      siblings.push(resource);
      childrenOf.set(parentId, siblings);
    }
  });

  childrenOf.forEach((children, parentId) => {
    const parent = resources.get(parentId);
    if (parent) {
      parent.children = children;
    }
  });

  // TODO: make this configurable via env
  const root =
    [...resources.values()].find(
      (r) =>
        r.kind === RESOURCE_TYPE.KUSTOMIZATION &&
        r.name === FLUX_NAMESPACE &&
        r.namespace === FLUX_NAMESPACE,
    ) ?? new KubeResource();

  return new Tree(root);
}
