export enum ROUTES {
  DASHBOARD = "/",
  RESOURCE = "/resource",
}

// Sub-view segments appended to a resource path, e.g. /resource/:uid/network.
// Graph is the default and carries no segment (a bare /resource/:uid).
export const GRAPH_SUBPATH = "graph";
export const TREE_SUBPATH = "tree";
export const NETWORK_SUBPATH = "network";
