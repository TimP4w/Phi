import "reflect-metadata";

import { makeAutoObservable } from "mobx";
import { injectable } from "inversify";
import { FluxResource, PodLog, Repository, SourceRef, Tree, KubeResource } from "../models/tree";

@injectable()
class FluxTreeStore {
  tree = new Tree(new KubeResource());
  selectedResource: KubeResource | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get root(): KubeResource {
    return this.tree.root;
  }

  get applications(): FluxResource[] {
    return this.tree
      .getApplicationResources()
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get repositories(): Repository[] {
    return this.tree
      .getRepositories()
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  findFluxParents(uid?: string): KubeResource[] {
    if (!uid) {
      return [];
    }

    const path: KubeResource[] = [];
    const isFluxResource = (resource: KubeResource) => resource instanceof FluxResource;

    function dfs(current: KubeResource, currentPath: KubeResource[]): boolean {
      if (current.uid === uid) {
        const fluxPath = currentPath.filter(isFluxResource);
        path.push(...fluxPath);
        return true;
      }
      for (const child of current.children) {
        if (dfs(child, [...currentPath, current])) {
          return true;
        }
      }
      return false;
    }

    dfs(this.tree.root, []);
    return path;

  }

  findRepositoryByRef(ref?: SourceRef): Repository | null {
    if (!ref) {
      return null;
    }

    const found = this.repositories.find(
      (repo) => repo.name === ref.name && repo.kind === ref.kind,
    );
    if (!found) {
      return null;
    }

    return found;
  }

  findResourceByUid(uid: string): KubeResource {
    return this.tree.findNodeById(uid);
  }

  setTree(tree: Tree) {
    this.tree = tree;
  }

  setSelectedResource(resource: KubeResource | null) {
    this.selectedResource = resource;
  }

  appendLog(log: PodLog) {
    if (!this.selectedResource) {
      return;
    }
    const newResource = { ...this.selectedResource };
    newResource.logs.unshift(log);
    this.selectedResource = newResource;
  }
}

export { FluxTreeStore };
