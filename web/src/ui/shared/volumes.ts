import {
  KubeResource,
  LonghornVolume,
  PersistentVolume,
  PersistentVolumeClaim,
} from "../../core/fluxTree/models/tree";

// The three storage kinds the UI treats uniformly as "volumes".
export type VolumeNode = PersistentVolumeClaim | PersistentVolume | LonghornVolume;

export const isVolume = (n: KubeResource): n is VolumeNode =>
  n instanceof PersistentVolumeClaim ||
  n instanceof PersistentVolume ||
  n instanceof LonghornVolume;

// Capacity/size in bytes, reading the field that carries it for each kind.
export const volumeSize = (n: VolumeNode): number => {
  if (n instanceof PersistentVolumeClaim) return n.metadata?.requested ?? 0;
  if (n instanceof PersistentVolume) return n.metadata?.capacity ?? 0;
  return n.metadata?.size ?? 0;
};

// All volumes in the subtree rooted at `root` (depth-first, cycle-safe).
export function collectVolumes(root: KubeResource): VolumeNode[] {
  const out: VolumeNode[] = [];
  const visited = new Set<string>();
  const visit = (n: KubeResource) => {
    if (visited.has(n.uid)) return;
    visited.add(n.uid);
    if (isVolume(n)) out.push(n);
    n.children.forEach(visit);
  };
  visit(root);
  return out;
}
