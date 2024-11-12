import { EventDto } from "./eventDto";

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
  children: TreeNodeDto[];
  conditions: ConditionDto[];
  events: EventDto[];
  status: "unknown" | "success" | "failed" | "pending" | "warning";
  isFluxManaged: boolean;
  createdAt: Date;
  deletedAt: Date;
  podMetadata?: PodMetadataDto;
  deploymentMetadata?: DeploymentMetadataDto;
  helmReleaseMetadata?: HelmReleaseMetadataDto;
  kustomizationMetadata?: KustomizationMetadataDto;
  pvcMetadata?: PersistentVolumeClaimMetadataDto;
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

type DeploymentMetadataDto = {
  replicas: number;
  readyReplicas: number;
  updatedReplicas: number;
  availableReplicas: number;
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


type HelmChartMetadataDto = {
};

type HelmRepositoryMetadataDto = {

};

type FluxMetadataDto = {
  lastHandledReconcileAt: Date;
  isReconciling: boolean;
  isSuspended: boolean;
};


export type LogMessageDto = {
  uid: string;
  log: string;
  timestamp: Date;
  container: string;
};
