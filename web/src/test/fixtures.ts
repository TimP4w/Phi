import { TreeNodeDto } from "../core/fluxTree/models/dtos/treeDto";
import {
  GitRepository,
  HelmRelease,
  KubeResource,
  Kustomization,
} from "../core/fluxTree/models/tree";

let uidCounter = 0;

/** Build a TreeNodeDto with sensible defaults; override only what a test cares about. A fresh uid is generated unless one is supplied. */
export function makeDto(overrides: Partial<TreeNodeDto> = {}): TreeNodeDto {
  return {
    uid: overrides.uid ?? `uid-${++uidCounter}`,
    name: "resource",
    kind: "ConfigMap",
    annotations: {},
    labels: {},
    conditions: [],
    status: "success",
    isFluxManaged: false,
    isReconcilable: false,
    hasMetrics: false,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function kubeResource(overrides: Partial<TreeNodeDto> = {}): KubeResource {
  return new KubeResource(makeDto(overrides));
}

export function kustomization(
  overrides: Partial<TreeNodeDto> = {},
): Kustomization {
  return new Kustomization(makeDto({ kind: "Kustomization", ...overrides }));
}

export function helmRelease(overrides: Partial<TreeNodeDto> = {}): HelmRelease {
  return new HelmRelease(makeDto({ kind: "HelmRelease", ...overrides }));
}

export function gitRepository(
  overrides: Partial<TreeNodeDto> = {},
): GitRepository {
  return new GitRepository(makeDto({ kind: "GitRepository", ...overrides }));
}

/** Attach children and return the parent, for assembling subtrees inline. */
export function withChildren<T extends KubeResource>(
  parent: T,
  children: KubeResource[],
): T {
  parent.children = children;
  return parent;
}
