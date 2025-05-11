import { ConditionDto, TreeNodeDto } from "./dtos/treeDto";
import { RESOURCE_TYPE } from "../constants/resources.const";
import { KubeEvent } from "./kubeEvent";

export class Tree {
  root: TreeNode;

  constructor(root: TreeNode) {
    this.root = root;
  }

  public getApplicationNodes(): TreeNode[] {
    const applications: TreeNode[] = [];
    const applicationKinds: string[] = [RESOURCE_TYPE.KUSTOMIZATION, RESOURCE_TYPE.HELM_RELEASE, RESOURCE_TYPE.HELM_CHART].map((kind) => kind.toString());
    this.traverse(this.root, (node) => {
      if (applicationKinds.includes(node.kind)) {
        applications.push(node);
      }
      return false;
    });
    return applications;
  }

  public getRepositories(): Repository[] {
    const repositories: Repository[] = [];
    const repositoryKinds: string[] = [RESOURCE_TYPE.OCI_REPOSITORY, RESOURCE_TYPE.HELM_REPOSITORY, RESOURCE_TYPE.GIT_REPOSITORY, RESOURCE_TYPE.BUCKET].map((kind) => kind.toString());
    this.traverse(this.root, (node) => {
      if (repositoryKinds.includes(node.kind)) {
        repositories.push(node as Repository);
      }
      return false;
    });
    return repositories;
  }


  public getFluxSystemPods(): TreeNode[] {
    const result: TreeNode[] = [];
    this.root.children.forEach((child) => {
      if (child.kind === RESOURCE_TYPE.DEPLOYMENT && child.namespace === "flux-system") {
        result.push(child);
      }
    });

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  public findNodeById(nodeId?: string): TreeNode {
    if (!nodeId) {
      return this.root;
    }
    const result = this.findNodeByIdRecursive(this.root, nodeId);
    if (result) {
      return result;
    }
    throw new Error(`Node with id ${nodeId} not found`);
  }

  private findNodeByIdRecursive(node: TreeNode, nodeId: string): TreeNode | null {
    if (node.uid === nodeId) {
      return node;
    }
    for (const child of node.children) {
      const result = this.findNodeByIdRecursive(child, nodeId);
      if (result) {
        return result;
      }
    }
    return null;
  }

  public traverse(startNode: TreeNode, callback: (node: TreeNode, layer: number) => boolean): void {
    this.traverseRecursive(startNode, 0, callback);
  }

  private traverseRecursive(node: TreeNode, layer: number, callback: (node: TreeNode, layer: number) => boolean): void {
    const skip = callback(node, layer);
    if (skip) {
      return;
    }
    for (const child of node.children) {
      this.traverseRecursive(child, layer + 1, callback);
    }
  }

  static fromDto(rootDto: TreeNodeDto): Tree {
    return new Tree(TreeNode.fromDto(rootDto));
  }
};

export class TreeNode {
  uid: string;
  name: string;
  kind: string;
  version?: string;
  namespace?: string;
  resource?: string;
  group?: string;
  createdAt: Date;
  deletedAt?: Date;
  children: TreeNode[] = [];
  annotations: Map<string, string>;
  labels: Map<string, string>;
  parentId: string | null;
  status: ResourceStatus;
  conditions: Condition[] = [];
  events: KubeEvent[] = [];
  logs: Log[] = [];
  isFluxManaged: boolean = false;
  fluxMetadata?: FluxMetadata;
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
      this.parentId = null;
      this.createdAt = new Date(dto.createdAt);
      this.deletedAt = dto.deletedAt ? new Date(dto.deletedAt) : undefined;
      this.children = dto.children ? dto.children.map((child) => TreeNode.fromDto(child)) : [];
      this.annotations = dto.annotations ? new Map(Object.entries(dto.annotations)) : new Map();
      this.labels = dto.labels ? new Map(Object.entries(dto.labels)) : new Map();
      this.conditions = dto.conditions ? dto.conditions.map((condition) => new Condition(condition)) : [];
      this.status = dto.status ? stringToResourceStatus(dto.status) : ResourceStatus.UNKNOWN;
      this.events = dto.events ? dto.events.map((event) => new KubeEvent(event)) : [];
      this.fluxMetadata = dto.fluxMetadata ? dto.fluxMetadata : undefined;
      this.isFluxManaged = dto.isFluxManaged;
      console.log(dto.annotations);
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
      this.parentId = null;
      this.createdAt = new Date();
      this.status = ResourceStatus.UNKNOWN;
      this.events = [];
    }
  }

  static fromDto(dto: TreeNodeDto): TreeNode {
    switch (dto.kind) {
      case RESOURCE_TYPE.KUSTOMIZATION:
        return new KustomizationNode(dto);
      case RESOURCE_TYPE.HELM_RELEASE:
        return new HelmReleaseNode(dto);
      case RESOURCE_TYPE.POD:
        return new PodNode(dto);
      case RESOURCE_TYPE.DEPLOYMENT:
        return new DeploymentNode(dto);
      case RESOURCE_TYPE.GIT_REPOSITORY:
        return new GitRepositoryNode(dto);
      case RESOURCE_TYPE.HELM_CHART:
        return new HelmChartNode(dto);
      case RESOURCE_TYPE.HELM_REPOSITORY:
        return new HelmRepositoryNode(dto);
      case RESOURCE_TYPE.PVC:
        return new PersistentVolumeClaimNode(dto);
      case RESOURCE_TYPE.OCI_REPOSITORY:
        return new OCIRepositoryNode(dto);
      default:
        return new TreeNode(dto);
    }
  }

};

// TODO: don't map into metadata, but as object property directly (TBD)
export class HelmReleaseNode extends TreeNode {
  metadata: HelmReleaseMetadata | null;
  isReconcillable: boolean = true;
  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.helmReleaseMetadata ? dto.helmReleaseMetadata : null;
  }
}
export class KustomizationNode extends TreeNode {
  metadata: KustomizationMetadata | null;
  isReconcillable: boolean = true;
  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.kustomizationMetadata ? dto.kustomizationMetadata : null;
  }

  getLastAttemptedHash(): string {
    return this.metadata?.lastAttemptedRevision
      ? this.metadata?.lastAttemptedRevision.slice(
        this.metadata?.lastAttemptedRevision.indexOf(":") + 1
      )
      : "";
  }

}

export interface Repository extends TreeNode {
  getURL(): string;
  getCode(): string;
}

export class PodNode extends TreeNode {
  metadata: PodMetadata | null;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.podMetadata ? dto.podMetadata : null;
  }
}

export class DeploymentNode extends TreeNode {
  metadata: DeploymentMetadata | null;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.deploymentMetadata ? dto.deploymentMetadata : null;
  }
}

export class PersistentVolumeClaimNode extends TreeNode {
  metadata: PersistentVolumeClaimMetadata | null;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.pvcMetadata ? dto.pvcMetadata : null;
  }
}

export class HelmChartNode extends TreeNode {
  metadata: HelmChartMetadata | null;
  isReconcillable: boolean = true;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.helmChartMetadata ? dto.helmChartMetadata : null;
  }
}

export class HelmRepositoryNode extends TreeNode {
  metadata: HelmRepositoryMetadata | null;
  isReconcillable: boolean = true;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.helmRepositoryMetadata ? dto.helmRepositoryMetadata : null;
  }
}

export class GitRepositoryNode extends TreeNode implements Repository {
  metadata: GitRepositoryMetadata | null;
  isReconcillable: boolean = true;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.gitRepositoryMetadata ? dto.gitRepositoryMetadata : null;
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

export class OCIRepositoryNode extends TreeNode implements Repository {
  metadata: OCIRepositoryMetadata | null;
  isReconcillable: boolean = true;

  constructor(dto: TreeNodeDto) {
    super(dto);
    this.metadata = dto.ociRepositoryMetadata ? dto.ociRepositoryMetadata : null;
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


type HelmChartMetadata = {
};

type HelmRepositoryMetadata = {

};

type FluxMetadata = {
  lastHandledReconcileAt: Date;
  isReconciling: boolean;
  isSuspended: boolean;
};

export enum ResourceStatus {
  SUCCESS = "success",
  FAILED = "failed",
  PENDING = "pending",
  WARNING = "warning",
  UNKNOWN = "unknown",
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
};

export class Log {
  log: string;
  timestamp: Date;
  container: string;

  constructor(timestamp: string, log: string, container: string) {
    this.log = log;
    this.timestamp = new Date(timestamp);
    this.container = container;
  }
}

function stringToResourceStatus(status: string): ResourceStatus {
  if (Object.values(ResourceStatus).includes(status as ResourceStatus)) {
    return status as ResourceStatus;
  }
  throw new Error(`Invalid ResourceStatus: ${status}`);
}

export type VizualizationNodeData = Record<'treeNode', TreeNode>;
