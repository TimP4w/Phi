import {
  makeObservable,
  observable,
  computed,
  action,
  reaction,
  ObservableMap,
  IReactionDisposer,
} from "mobx";
import {
  FluxResource,
  PodLog,
  Repository,
  SourceRef,
  Tree,
  KubeResource,
  Kustomization,
  Node,
} from "../models/tree";
import { RESOURCE_TYPE } from "../constants/resources.const";
import { indexFindingsByTarget, TrivySummary } from "../../trivy/trivy";
import { TreeNodeDto } from "../models/dtos/treeDto";
import { buildTree } from "../buildTree";

class FluxTreeStore {
  // resources: MobX ObservableMap that holds all cached KubeResources by UID.
  // MobX automatically tracks reads/writes; computed and actions react to changes.
  resources: ObservableMap<string, KubeResource> = observable.map<
    string,
    KubeResource
  >();
  private _tree: Tree = new Tree(new KubeResource());
  private selectedUid: string | null = null;
  // Bumped by incremental upsert/remove; a debounced reaction watches it to
  // coalesce tree rebuilds over a short window (see REBUILD_WINDOW_MS).
  private _revision = 0;
  private readonly _disposeRebuild: IReactionDisposer;
  // Streaming pod logs are ephemeral UI state keyed by resource UID, kept off the
  // KubeResource model so a new array reference (map.set) drives MobX reactivity.
  logsByUid: ObservableMap<string, PodLog[]> = observable.map<string, PodLog[]>();

  constructor() {
    makeObservable<FluxTreeStore, "_tree" | "selectedUid" | "_revision">(this, {
      _tree: observable.ref,
      selectedUid: observable,
      _revision: observable,
      selectedResource: computed,
      tree: computed,
      applications: computed,
      repositories: computed,
      dashboardResources: computed,
      nodes: computed,
      resourceCount: computed,
      trivyIndex: computed,
      upsertResource: action,
      removeResource: action,
      syncResources: action,
      setSelectedResource: action,
      appendLog: action,
    });

    // Coalesce bursty incremental mutations into a single rebuild. MobX's `delay`
    // debounces and the disposer makes this cancellable/lifecycle-aware (unlike a
    // raw setTimeout). syncResources rebuilds synchronously and is not routed here.
    this._disposeRebuild = reaction(
      () => this._revision,
      () => {
        this._tree = buildTree(this.resources);
      },
      { delay: FluxTreeStore.REBUILD_WINDOW_MS },
    );
  }

  dispose(): void {
    this._disposeRebuild();
  }

  get selectedResource(): KubeResource | null {
    return this.selectedUid
      ? (this.resources.get(this.selectedUid) ?? null)
      : null;
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

  // Window over which bursty incremental mutations are coalesced into one rebuild.
  private static readonly REBUILD_WINDOW_MS = 150;

  upsertResource(dto: TreeNodeDto): void {
    if (!dto.uid) return;
    this.resources.set(dto.uid, KubeResource.fromDto(dto));
    this._revision++;
  }

  removeResource(uid: string): void {
    this.resources.delete(uid);
    this.logsByUid.delete(uid);
    this._revision++;
  }

  syncResources(dtos: TreeNodeDto[]): void {
    this.resources.clear();
    for (const dto of dtos) {
      if (dto.uid) this.resources.set(dto.uid, KubeResource.fromDto(dto));
    }
    // Drop logs for resources that no longer exist after the resync.
    for (const uid of this.logsByUid.keys()) {
      if (!this.resources.has(uid)) this.logsByUid.delete(uid);
    }
    // Full resync rebuilds immediately rather than via the debounced reaction.
    this._tree = buildTree(this.resources);
  }

  // --- computed getters ---

  get applications(): FluxResource[] {
    const result: FluxResource[] = [];
    this.resources.forEach((r) => {
      if (r.fluxRole === "application") result.push(r as FluxResource);
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  get repositories(): Repository[] {
    const result: Repository[] = [];
    this.resources.forEach((r) => {
      if (r.fluxRole === "repository") result.push(r as Repository);
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Applications + repositories, the set the dashboard renders/filters over.
  // MobX-cached so the concat is not rebuilt on every dashboard re-render.
  get dashboardResources(): FluxResource[] {
    return [...this.applications, ...this.repositories];
  }

  /** Core v1 Nodes (the Longhorn Node CRD is modelled separately). */
  get nodes(): Node[] {
    const result: Node[] = [];
    this.resources.forEach((r) => {
      if (r instanceof Node) result.push(r);
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  // --- lookup helpers ---

  findResourceByUid(uid: string): KubeResource | undefined {
    return this.resources.get(uid);
  }

  // Distinct kinds in the subtree rooted at uid (inclusive), sorted.
  kindsInSubtree(uid?: string): string[] {
    const root = uid ? this.resources.get(uid) : undefined;
    if (!root) return [];
    const kinds = new Set<string>();
    const visit = (node: KubeResource, visited: Set<string>) => {
      if (visited.has(node.uid)) return;
      visited.add(node.uid);
      kinds.add(node.kind);
      for (const child of node.children ?? []) visit(child, visited);
    };
    visit(root, new Set());
    return Array.from(kinds).sort();
  }

  // UIDs in the subtree rooted at uid that report metrics, plus the root itself
  // (so its aggregate is always fetched), sorted.
  metricsUidsInSubtree(uid?: string): string[] {
    const root = uid ? this.resources.get(uid) : undefined;
    if (!root) return [];
    const uids = new Set<string>();
    const visit = (node: KubeResource, visited: Set<string>) => {
      if (visited.has(node.uid)) return;
      visited.add(node.uid);
      if (node.hasMetrics) uids.add(node.uid);
      for (const child of node.children ?? []) visit(child, visited);
    };
    visit(root, new Set());
    uids.add(root.uid);
    return [...uids].sort();
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

  logsFor(uid?: string | null): PodLog[] {
    return uid ? (this.logsByUid.get(uid) ?? []) : [];
  }

  appendLog(log: PodLog) {
    const uid = this.selectedUid;
    if (!uid) return;
    // Replace the array (don't mutate) so the ObservableMap entry change notifies.
    this.logsByUid.set(uid, [...this.logsFor(uid), log]);
  }
}

export { FluxTreeStore };
