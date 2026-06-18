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
  status: "unknown" | "success" | "failed" | "pending" | "warning" | "suspended";
  isFluxManaged: boolean;
  // Timestamps arrive as JSON strings; the model constructors convert to Date.
  createdAt: string;
  deletedAt?: string;
  podMetadata?: PodMetadataDto;
  deploymentMetadata?: DeploymentMetadataDto;
  helmReleaseMetadata?: HelmReleaseMetadataDto;
  kustomizationMetadata?: KustomizationMetadataDto;
  pvcMetadata?: PersistentVolumeClaimMetadataDto;
  pvMetadata?: PersistentVolumeMetadataDto;
  longhornVolumeMetadata?: LonghornVolumeMetadataDto;
  longhornNodeMetadata?: LonghornNodeMetadataDto;
  gitRepositoryMetadata?: GitRepositoryMetadataDto;
  helmChartMetadata?: HelmChartMetadataDto;
  helmRepositoryMetadata?: HelmRepositoryMetadataDto;
  ociRepositoryMetadata?: OCIRepositoryMetadataDto;
  fluxMetadata?: FluxMetadataDto;
  serviceMetadata?: ServiceMetadataDto;
  routeMetadata?: RouteMetadataDto;
  endpointSliceMetadata?: EndpointSliceMetadataDto;
  gatewayMetadata?: GatewayMetadataDto;
  certificateMetadata?: CertificateMetadataDto;
  networkPolicyMetadata?: NetworkPolicyMetadataDto;
  proxyMetadata?: ProxyMetadataDto;
  trivyMetadata?: TrivyMetadataDto;
};

// TrivyMetadataDto is the per-report summary streamed on Trivy Operator report
// resources. The full findings arrays are fetched on demand via the Trivy
// findings endpoint, not carried here.
export type TrivyMetadataDto = {
  reportType?: "vulnerability" | "configAudit" | "exposedSecret" | "rbacAssessment";
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  unknown?: number;
  targetKind?: string;
  targetName?: string;
  targetNamespace?: string;
};

export type ServiceMetadataDto = {
  type?: string;
  clusterIPs?: string[];
  externalIPs?: string[];
  selector?: Record<string, string>;
  ports?: ServicePortDto[];
};

export type ServicePortDto = {
  name?: string;
  protocol?: string;
  port: number;
  targetPort?: string;
  nodePort?: number;
};

export type BackendRefDto = {
  group?: string;
  kind?: string;
  name: string;
  namespace?: string;
  port?: number;
};

export type RouteParentRefDto = {
  group?: string;
  kind?: string;
  name: string;
  namespace?: string;
  sectionName?: string;
};

export type RouteMetadataDto = {
  class?: string;
  hostnames?: string[];
  backendRefs?: BackendRefDto[];
  routeParentRefs?: RouteParentRefDto[];
  addresses?: string[];
  tlsSecretRefs?: string[];
  middlewareRefs?: string[];
  entryPoints?: string[];
  tlsEnabled?: boolean;
};

export type CertificateMetadataDto = {
  secretName?: string;
  ready?: boolean;
  notAfter?: string;
  issuer?: string;
  dnsNames?: string[];
};

export type NetworkPolicyMetadataDto = {
  podSelector?: Record<string, string>;
  policyTypes?: string[];
  ingressRules?: number;
  egressRules?: number;
};

export type ProxyMetadataDto = {
  // Entrypoint/listener name -> middleware refs applied to all traffic on it.
  entrypointMiddlewares?: Record<string, string[]>;
};

export type EndpointTargetDto = {
  targetKind?: string;
  targetName?: string;
  targetUID?: string;
  ready: boolean;
};

export type EndpointSliceMetadataDto = {
  serviceName?: string;
  endpoints?: EndpointTargetDto[];
};

export type GatewayListenerDto = {
  name?: string;
  protocol?: string;
  hostname?: string;
  port?: number;
};

export type GatewayMetadataDto = {
  gatewayClassName?: string;
  addresses?: string[];
  listeners?: GatewayListenerDto[];
  tlsSecretRefs?: string[];
};

export type ConditionDto = {
  lastTransitionTime: string;
  type: string;
  status: "True" | "False";
  message: string;
  reason: string;
};

export type ContainerDto = {
  name: string;
  image: string;
  ready: boolean;
  started: boolean;
  restartCount: number;
  state: string;
  reason?: string;
  message?: string;
  exitCode?: number;
  isInit?: boolean;
};

export type PodMetadataDto = {
  phase: string;
  image: string;
  containers?: ContainerDto[];
};

type HelmReleaseMetadataDto = {
  chartName: string;
  chartVersion: string;
  sourceRef: SourceRefDto;
};

type KustomizationMetadataDto = {
  path: string;
  sourceRef: SourceRefDto;
  lastAppliedRevision: string;
  lastAttemptedRevision: string;
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
  capacity: Record<string, string>;
  phase: string;
  requested?: number;
};

type PersistentVolumeMetadataDto = {
  capacity?: number;
  storageClass?: string;
  driver?: string;
  accessModes?: string[];
  reclaimPolicy?: string;
  volumeMode?: string;
  phase?: string;
  nfsServer?: string;
  nfsShare?: string;
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
  lastHandledReconcileAt?: string;
  isReconciling: boolean;
  isSuspended: boolean;
  lastSyncAt?: string;
};


export type LogMessageDto = {
  uid: string;
  log: string;
  timestamp: string;
  container: string;
};

export type ResourcePatchDto = {
  op: "upsert" | "delete";
  resource?: TreeNodeDto;
};

export type ResourceSyncDto = TreeNodeDto[];
