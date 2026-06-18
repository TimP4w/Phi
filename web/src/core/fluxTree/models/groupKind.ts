// Type identity of a resource: group + kind (version excluded).
export type GroupKind = { group?: string; kind: string };

// Canonical key mirroring backend schema.GroupKind.String() ("Pod", "Node.longhorn.io").
export const groupKindKey = ({ group, kind }: GroupKind): string =>
  group ? `${kind}.${group}` : kind;
