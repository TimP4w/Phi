import { KubeResource, ResourceStatus } from "../../core/fluxTree/models/tree";

export type ResourceFilter = {
  statuses: ResourceStatus[];
  kinds: string[];
};

export function subtreeHasMatch(node: KubeResource, filter: ResourceFilter): boolean {
  const statusMatch = filter.statuses.length === 0 || filter.statuses.includes(node.status);
  const kindMatch = filter.kinds.length === 0 || filter.kinds.includes(node.kind);
  if (statusMatch && kindMatch) return true;
  return (node.children ?? []).some((child) => subtreeHasMatch(child, filter));
}
