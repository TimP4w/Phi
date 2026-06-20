import { KubeResource, ResourceStatus } from "../../core/fluxTree/models/tree";

export type ResourceFilter = {
  statuses: ResourceStatus[];
  kinds: string[];
};

export function nodeMatchesFilter(node: KubeResource, filter: ResourceFilter): boolean {
  const statusMatch = filter.statuses.length === 0 || filter.statuses.includes(node.status);
  const kindMatch = filter.kinds.length === 0 || filter.kinds.includes(node.kind);
  return statusMatch && kindMatch;
}

export function subtreeHasMatch(node: KubeResource, filter: ResourceFilter): boolean {
  if (nodeMatchesFilter(node, filter)) return true;
  return (node.children ?? []).some((child) => subtreeHasMatch(child, filter));
}

// One O(n) post-order pass collecting every UID whose subtree (inclusive) holds a
// match. ResourceTree renders recursively, so a per-node subtreeHasMatch would be
// O(n²); precomputing this set once and testing membership keeps tree filtering linear.
export function collectMatchingSubtrees(
  root: KubeResource,
  filter: ResourceFilter,
): Set<string> {
  const matching = new Set<string>();
  const visit = (node: KubeResource): boolean => {
    let any = nodeMatchesFilter(node, filter);
    for (const child of node.children ?? []) {
      if (visit(child)) any = true;
    }
    if (any) matching.add(node.uid);
    return any;
  };
  visit(root);
  return matching;
}
