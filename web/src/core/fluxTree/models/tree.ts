import { ConditionDto, LogMessageDto, TreeNodeDto } from "./dtos/treeDto";
import { FLUX_NAMESPACE, RESOURCE_TYPE } from "../constants/resources.const";
import { KubeEvent } from "./kubeEvent";

export class Tree {
  root: KubeResource;

  constructor(root: KubeResource) {
    this.root = root;
  }

  public getFluxControllersDeployments(): Deployment[] {
    const result: Deployment[] = [];
    this.root.children.forEach((child) => {
      if (child.kind === RESOURCE_TYPE.DEPLOYMENT && child.namespace === FLUX_NAMESPACE) {
        result.push(child as Deployment);
      }
    });

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  public traverse(
    startNode: KubeResource,
    callback: (node: KubeResource, layer: number) => boolean,
  ): void {
    this.traverseRecursive(startNode, 0, callback, new Set());
  }

  private traverseRecursive(
    node: KubeResource,
    layer: number,
    callback: (node: KubeResource, layer: number) => boolean,
    visited: Set<string>,
  ): void {
    if (visited.has(node.uid)) return;
    visited.add(node.uid);
    const skip = callback(node, layer);
    if (skip) {
      return;
    }
    for (const child of node.children) {
      this.traverseRecursive(child, layer + 1, callback, visited);
    }
  }

}

export class KubeResource {
  uid: string;
  name: string;
  kind: string;
  version?: string;
  namespace?: string;
  resource?: string;
  group?: string;
  createdAt: Date;
  deletedAt?: Date;
  children: KubeResource[] = [];
  annotations: Map<string, string>;
  labels: Map<string, string>;
  parentIDs: string[];
  status: ResourceStatus;
  conditions: Condition[] = [];
  events: KubeEvent[] = [];
  logs: PodLog[] = [];
  isFluxManaged: boolean = false;
  isReconcillable: boolean = false;

  constructor();
  constructor(dto: TreeNodeDto);
  constructor(dto?: TreeNodeDto) {
    if (dto) {
      this.uid = dto.uid;
      this.name = dto.name;
      this.kind = dto.kind;
      this.version = dto.version;
      this.namespace = dto.namespace;
      this.resource = dto.resource;
      this.group = dto.group;
      this.parentIDs = dto.parentIDs || [];
      this.createdAt = new Date(dto.createdAt);
      this.deletedAt = dto.deletedAt ? new Date(dto.deletedAt) : undefined;
      this.children = [];

      this.annotations = dto.annotations
        ? new Map(Object.entries(dto.annotations))
        : new Map();
      this.labels = dto.labels
        ? new Map(Object.entries(dto.labels))
        : new Map();
      this.conditions = dto.conditions
        ? dto.conditions.map((condition) => new Condition(condition))
        : [];
      this.status = dto.status
        ? stringToResourceStatus(dto.status)
        : ResourceStatus.UNKNOWN;
      this.events = dto.events
        ? dto.events.map((event) => new KubeEvent(event))
        : [];
      this.isFluxManaged = dto.isFluxManaged;
    } else {
      this.uid = "";
      this.name = "";
      this.kind = "";
      this.version = "";
      this.namespace = "";
      this.resource = "";
      this.group = "";
      this.labels = new Map<string, string>();
      this.annotations = new Map<string, string>();
      this.parentIDs = [];
      this.createdAt = new Date();
      this.status = ResourceStatus.UNKNOWN;
      this.events = [];
    }
  }

  static fromDto(dto: TreeNodeDto): KubeResource {
    switch (dto.kind) {
      case RESOURCE_TYPE.KUSTOMIZATION:
        return new Kustomization(dto);
      case RESOURCE_TYPE.HELM_RELEASE:
        return new HelmRelease(dto);
      case RESOURCE_TYPE.POD:
        return new Pod(dto);
      case RESOURCE_TYPE.DEPLOYMENT:
        return new Deployment(dto);
      case RESOURCE_TYPE.GIT_REPOSITORY:
        return new GitRepository(dto);
      case RESOURCE_TYPE.HELM_CHART:
        return new HelmChart(dto);
      case RESOURCE_TYPE.HELM_REPOSITORY:
        return new HelmRepository(dto);
      case RESOURCE_TYPE.PVC:
        return new PersistentVolumeClaim(dto);
      case RESOURCE_TYPE.OCI_REPOSITORY:
        return new OCIRepository(dto);
      default:
        return new KubeResource(dto);
    }
  }
}

export abstract class FluxResource extends KubeResource {
  isReconcillable: boolean = true;
  lastHandledReconcileAt?: Date;
  isReconciling: boolean;
  isSuspended: boolean;
  lastSyncAt?: Date;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.lastHandledReconcileAt = dto.fluxMetadata?.lastHandledReconcileAt;
    this.isReconciling = dto.fluxMetadata?.isReconciling || false;
    this.isSuspended = dto.fluxMetadata?.isSuspended || false;
    this.lastSyncAt = dto.fluxMetadata?.lastSyncAt;
  }
}


export interface Repository extends FluxResource {
  getURL(): string;
  getCode(): string;
}


// TODO: don't map into metadata, but as object property directly (TBD)
export class HelmRelease extends FluxResource {
  metadata: HelmReleaseMetadata | null;
  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.helmReleaseMetadata ? dto.helmReleaseMetadata : null;
  }
}
export class Kustomization extends FluxResource {
  metadata: KustomizationMetadata | null;
  isReconcillable: boolean = true;
  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.kustomizationMetadata
      ? dto.kustomizationMetadata
      : null;
  }

  getLastAttemptedHash(): string {
    return this.metadata?.lastAttemptedRevision
      ? this.metadata?.lastAttemptedRevision.slice(
        this.metadata?.lastAttemptedRevision.indexOf(":") + 1,
      )
      : "";
  }
}

export class HelmChart extends FluxResource {
  metadata: HelmChartMetadata | null;
  isReconcillable: boolean = true;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.helmChartMetadata ? dto.helmChartMetadata : null;
  }
}

export class HelmRepository extends FluxResource {
  metadata: HelmRepositoryMetadata | null;
  isReconcillable: boolean = true;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.helmRepositoryMetadata
      ? dto.helmRepositoryMetadata
      : null;
  }
}

export class GitRepository extends FluxResource implements Repository {
  metadata: GitRepositoryMetadata | null;
  isReconcillable: boolean = true;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.gitRepositoryMetadata
      ? dto.gitRepositoryMetadata
      : null;
  }

  getURL(): string {
    return this.metadata?.url || "";
  }

  getCode(): string {
    if (this.metadata?.branch) {
      return `@${this.metadata?.branch}`;
    }

    if (this.metadata?.tag) {
      return `:${this.metadata?.tag}`;
    }

    if (this.metadata?.semver) {
      return `:${this.metadata?.semver}`;
    }

    if (this.metadata?.commit) {
      return `:${this.metadata?.commit.slice(0, 8)}`;
    }

    if (this.metadata?.name) {
      return `:${this.metadata?.name}`;
    }

    return "";
  }
}

export class OCIRepository extends FluxResource implements Repository {
  metadata: OCIRepositoryMetadata | null;
  isReconcillable: boolean = true;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.ociRepositoryMetadata
      ? dto.ociRepositoryMetadata
      : null;
  }

  getURL(): string {
    return this.metadata?.url || "";
  }

  getCode() {
    if (this.metadata?.digest) {
      return `@${this.metadata?.digest.slice(7)}`;
    }

    if (this.metadata?.tag) {
      return `:${this.metadata?.tag}`;
    }

    if (this.metadata?.semver) {
      return `:${this.metadata?.semver}`;
    }

    if (this.metadata?.semverFilter) {
      return `:${this.metadata?.semverFilter}`;
    }

    return "";
  }
}


export class Pod extends KubeResource {
  metadata: PodMetadata | null;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.podMetadata ? dto.podMetadata : null;
  }
}

export class Deployment extends KubeResource {
  metadata: DeploymentMetadata | null;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.deploymentMetadata ? dto.deploymentMetadata : null;
  }
}

export class PersistentVolumeClaim extends KubeResource {
  metadata: PersistentVolumeClaimMetadata | null;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.pvcMetadata ? dto.pvcMetadata : null;
  }
}

export type PodMetadata = {
  phase: string;
  image: string;
};

type HelmReleaseMetadata = {
  chartName: string;
  chartVersion: string;
  isReconciling: boolean;
  isSuspended: boolean;
  sourceRef: SourceRef; // HelmRepository
  // TODO: chartRef: OCIRepository or HelmChart
};

type KustomizationMetadata = {
  path: string;
  isReconciling: boolean;
  isSuspended: boolean;
  sourceRef: SourceRef; // GitRepository, OCIRepository or Bucket
  lastAppliedRevision: string;
  lastAttemptedRevision: string;
  lastHandledReconcileAt: Date;
  dependsOn: string[];
};

export type SourceRef = {
  kind: string;
  name: string;
};

type PersistentVolumeClaimMetadata = {
  storageClass: string;
  volumeName: string;
  volumeMode: string;
  accessModes: string[];
  capacity: Map<string, string>;
  phase: string;
};

type DeploymentMetadata = {
  replicas: number;
  readyReplicas: number;
  updatedReplicas: number;
  availableReplicas: number;
  images: string[];
};

type GitRepositoryMetadata = {
  url: string;
  branch: string;
  tag: string;
  semver: string;
  name: string;
  commit: string;
};

type OCIRepositoryMetadata = {
  url: string;
  digest: string;
  tag: string;
  semver: string;
  semverFilter: string;
};

type HelmChartMetadata = unknown;

type HelmRepositoryMetadata = unknown;



export enum ResourceStatus {
  SUCCESS = "success",
  FAILED = "failed",
  PENDING = "pending",
  WARNING = "warning",
  UNKNOWN = "unknown",
  SUSPENDED = "suspended",
}

export class Condition {
  lastTransitionTime: Date;
  type: string;
  status: boolean;
  message: string;
  reason: string;

  constructor(dto: ConditionDto) {
    this.lastTransitionTime = new Date(dto.lastTransitionTime);
    this.type = dto.type;
    this.status = dto.status === "True";
    this.message = dto.message;
    this.reason = dto.reason;
  }
}

export class PodLog {
  log: string;
  timestamp: Date;
  container: string;

  constructor(timestamp: string, log: string, container: string) {
    this.log = log;
    this.timestamp = new Date(timestamp);
    this.container = container;
  }

  static fromDto(dto: LogMessageDto): PodLog {
    return new PodLog(dto.timestamp.toString(), dto.log, dto.container);
  }
}

function stringToResourceStatus(status: string): ResourceStatus {
  if (Object.values(ResourceStatus).includes(status as ResourceStatus)) {
    return status as ResourceStatus;
  }
  console.warn(`Unknown ResourceStatus "${status}", defaulting to UNKNOWN`);
  return ResourceStatus.UNKNOWN;
}

export type VizualizationNodeData = Record<"treeNode", KubeResource>;
