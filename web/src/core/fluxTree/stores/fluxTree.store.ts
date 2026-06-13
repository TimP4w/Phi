import {
  makeObservable,
  observable,
  computed,
  action,
  runInAction,
  ObservableMap,
} from "mobx";
import {
  FluxResource,
  PodLog,
  Repository,
  SourceRef,
  Tree,
  KubeResource,
  Kustomization,
} from "../models/tree";
import { RESOURCE_TYPE, FLUX_NAMESPACE, TRIVY_REPORT_KINDS } from "../constants/resources.const";
import {
  indexFindingsByTarget,
  TrivySummary,
} from "../../trivy/trivy";
import { TreeNodeDto } from "../models/dtos/treeDto";

const APPLICATION_KINDS = new Set([
  RESOURCE_TYPE.KUSTOMIZATION,
  RESOURCE_TYPE.HELM_RELEASE,
  RESOURCE_TYPE.HELM_CHART,
]);

const REPOSITORY_KINDS = new Set([
  RESOURCE_TYPE.OCI_REPOSITORY,
  RESOURCE_TYPE.HELM_REPOSITORY,
  RESOURCE_TYPE.GIT_REPOSITORY,
  RESOURCE_TYPE.BUCKET,
]);

function buildTree(resources: Map<string, KubeResource>): Tree {
  resources.forEach((resource) => {
    resource.children = [];
  });

  const childrenOf = new Map<string, KubeResource[]>();

  resources.forEach((resource) => {
    // Trivy report CRDs are a findings overlay, not graph nodes — keep them in
    // the resource map (for the findings index) but never attach them as children.
    if (TRIVY_REPORT_KINDS.has(resource.kind)) return;
    const parentId = resource.parentIDs[0];
    // Skip self-references and back-edges that would create cycles
    if (parentId && parentId !== resource.uid && resources.has(parentId)) {
      const siblings = childrenOf.get(parentId) ?? [];
      siblings.push(resource);
      childrenOf.set(parentId, siblings);
    }
  });

  childrenOf.forEach((children, parentId) => {
    const parent = resources.get(parentId);
    if (parent) {
      parent.children = children;
    }
  });

  // TODO: make this configurable via env
  const root =
    [...resources.values()].find(
      (r) =>
        r.kind === RESOURCE_TYPE.KUSTOMIZATION &&
        r.name === FLUX_NAMESPACE &&
        r.namespace === FLUX_NAMESPACE,
    ) ?? new KubeResource();

  return new Tree(root);
}

class FluxTreeStore {
  // resources: MobX ObservableMap that holds all cached KubeResources by UID.
  // MobX automatically tracks reads/writes; computed and actions react to changes.
  resources: ObservableMap<string, KubeResource> = observable.map<string, KubeResource>();
  private _tree: Tree = new Tree(new KubeResource());
  private selectedUid: string | null = null;

  constructor() {
    makeObservable<FluxTreeStore, "_tree" | "selectedUid">(this, {
      _tree: observable.ref,
      selectedUid: observable,
      selectedResource: computed,
      tree: computed,
      applications: computed,
      repositories: computed,
      resourceCount: computed,
      trivyIndex: computed,
      upsertResource: action,
      removeResource: action,
      syncResources: action,
      setSelectedResource: action,
      appendLog: action,
    });
  }

  get selectedResource(): KubeResource | null {
    return this.selectedUid ? (this.resources.get(this.selectedUid) ?? null) : null;
  }

  get tree(): Tree {
    return this._tree;
  }

  get resourceCount(): number {
    return this.resources.size;
  }

  // Trivy findings indexed by the UID of the workload each report targets.
  // Computed once per resource change and shared by every findings widget.
  get trivyIndex(): Map<string, TrivySummary> {
    return indexFindingsByTarget(this.resources.values());
  }

  // --- flat map mutators ---

  private _rebuildScheduled = false;

  private scheduleBuild(): void {
    if (this._rebuildScheduled) return;
    this._rebuildScheduled = true;
    Promise.resolve().then(() =>
      runInAction(() => {
        this._tree = buildTree(this.resources);
        this._rebuildScheduled = false;
      }),
    );
  }

  upsertResource(dto: TreeNodeDto): void {
    if (!dto.uid) return;
    this.resources.set(dto.uid, KubeResource.fromDto(dto));
    this.scheduleBuild();
  }

  removeResource(uid: string): void {
    this.resources.delete(uid);
    this.scheduleBuild();
  }

  syncResources(dtos: TreeNodeDto[]): void {
    this.resources.clear();
    for (const dto of dtos) {
      if (dto.uid) this.resources.set(dto.uid, KubeResource.fromDto(dto));
    }
    this._tree = buildTree(this.resources);
  }

  // --- computed getters ---

  get applications(): FluxResource[] {
    const result: FluxResource[] = [];
    this.resources.forEach((r) => {
      if (APPLICATION_KINDS.has(r.kind as RESOURCE_TYPE))
        result.push(r as FluxResource);
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  get repositories(): Repository[] {
    const result: Repository[] = [];
    this.resources.forEach((r) => {
      if (REPOSITORY_KINDS.has(r.kind as RESOURCE_TYPE))
        result.push(r as Repository);
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  // --- lookup helpers ---

  findResourceByUid(uid: string): KubeResource | undefined {
    return this.resources.get(uid);
  }

  findKustomizationByName(name?: string): Kustomization | null {
    if (!name) return null;
    return (
      (this.applications.find(
        (app) => app.name === name && app.kind === RESOURCE_TYPE.KUSTOMIZATION,
      ) as Kustomization) ?? null
    );
  }

  findRepositoryByNameAndKind(name?: string, kind?: string): Repository | null {
    if (!name || !kind) return null;
    return (
      this.repositories.find(
        (repo) => repo.name === name && repo.kind === kind,
      ) ?? null
    );
  }

  findFluxParents(uid?: string): KubeResource[] {
    if (!uid) return [];
    const path: KubeResource[] = [];
    const visited = new Set<string>([uid]);
    let current = this.resources.get(uid);
    while (current) {
      const parentId = current.parentIDs[0];
      if (!parentId || visited.has(parentId)) break;
      visited.add(parentId);
      const parent = this.resources.get(parentId);
      if (!parent) break;
      if (parent instanceof FluxResource) path.unshift(parent);
      current = parent;
    }
    return path;
  }

  findRepositoryByRef(ref?: SourceRef): Repository | null {
    if (!ref) return null;
    return (
      this.repositories.find(
        (repo) => repo.name === ref.name && repo.kind === ref.kind,
      ) ?? null
    );
  }

  get root(): KubeResource {
    return this._tree.root;
  }

  setSelectedResource(resource: KubeResource | null) {
    this.selectedUid = resource?.uid ?? null;
  }

  appendLog(log: PodLog) {
    const resource = this.selectedUid ? this.resources.get(this.selectedUid) : undefined;
    if (!resource) return;
    resource.logs.push(log);
    // Create a new Tree instance to trigger observable.ref reactivity
    this._tree = new Tree(this._tree.root);
  }
}

export { FluxTreeStore };

export const fluxTreeStore = new FluxTreeStore();
