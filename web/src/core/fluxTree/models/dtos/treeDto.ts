export type TreeDto = {
  root: TreeNodeDto;
};

export type TreeNodeDto = {
  uid: string;
  name: string;
  kind: string;
  version?: string;
  namespace?: string;
  resource?: string;
  group?: string;
  parentIDs?: string[];
  children?: TreeNodeDto[];
  annotations: Record<string, string>;
  labels: Record<string, string>;
  conditions: ConditionDto[];
  status: "unknown" | "success" | "failed" | "pending" | "warning";
  isFluxManaged: boolean;
  createdAt: Date;
  deletedAt: Date;
  podMetadata?: PodMetadataDto;
  deploymentMetadata?: DeploymentMetadataDto;
  helmReleaseMetadata?: HelmReleaseMetadataDto;
  kustomizationMetadata?: KustomizationMetadataDto;
  pvcMetadata?: PersistentVolumeClaimMetadataDto;
  longhornVolumeMetadata?: LonghornVolumeMetadataDto;
  longhornNodeMetadata?: LonghornNodeMetadataDto;
  gitRepositoryMetadata?: GitRepositoryMetadataDto;
  helmChartMetadata?: HelmChartMetadataDto;
  helmRepositoryMetadata?: HelmRepositoryMetadataDto;
  ociRepositoryMetadata?: OCIRepositoryMetadataDto;
  fluxMetadata?: FluxMetadataDto;
};

export type ConditionDto = {
  lastTransitionTime: Date;
  type: string;
  status: "True" | "False";
  message: string;
  reason: string;
};

export type PodMetadataDto = {
  phase: string;
  image: string;
};

type HelmReleaseMetadataDto = {
  chartName: string;
  chartVersion: string;
  isReconciling: boolean;
  isSuspended: boolean;
  sourceRef: SourceRefDto;
};

type KustomizationMetadataDto = {
  path: string;
  isReconciling: boolean;
  isSuspended: boolean;
  sourceRef: SourceRefDto;
  lastAppliedRevision: string;
  lastAttemptedRevision: string;
  lastHandledReconcileAt: Date;
  dependsOn: string[];
};

type SourceRefDto = {
  kind: string;
  name: string;
};

type PersistentVolumeClaimMetadataDto = {
  storageClass: string;
  volumeName: string;
  volumeMode: string;
  accessModes: string[];
  capacity: Map<string, string>;
  phase: string;
};

type LonghornVolumeMetadataDto = {
  state: string;
  robustness: string;
  size: number;
  actualSize: number;
  numberOfReplicas: number;
  nodeID: string;
  frontend: string;
  accessMode: string;
};

type LonghornNodeMetadataDto = {
  ready: boolean;
  schedulable: boolean;
  storageMaximum: number;
  storageUsed: number;
  storageReserved: number;
  storageSchedulable: number;
  storageDisabled: number;
};

type DeploymentMetadataDto = {
  replicas: number;
  readyReplicas: number;
  updatedReplicas: number;
  availableReplicas: number;
  images: string[];

};

type GitRepositoryMetadataDto = {
  url: string;
  branch: string;
  tag: string;
  semver: string;
  name: string;
  commit: string;
};

type OCIRepositoryMetadataDto = {
  url: string;
  digest: string;
  tag: string;
  semver: string;
  semverFilter: string;
};

type HelmChartMetadataDto = unknown;

type HelmRepositoryMetadataDto = unknown;

type FluxMetadataDto = {
  lastHandledReconcileAt: Date;
  isReconciling: boolean;
  isSuspended: boolean;
  lastSyncAt: Date;
};


export type LogMessageDto = {
  uid: string;
  log: string;
  timestamp: Date;
  container: string;
};

export type ResourcePatchDto = {
  op: "upsert" | "delete";
  resource?: TreeNodeDto;
};

export type ResourceSyncDto = TreeNodeDto[];
