import "reflect-metadata";

import { makeAutoObservable } from "mobx";
import { injectable } from "inversify";
import { FluxResource, PodLog, Repository, SourceRef, Tree, KubeResource, Kustomization } from "../models/tree";
import { RESOURCE_TYPE } from "../constants/resources.const";

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

  addResource(resource: KubeResource) {
    const parentUid = resource.parentIds && resource.parentIds.length > 0 ? resource.parentIds[0] : null;
    if (parentUid) {
      const parent = this.tree.findNodeById(parentUid);
      if (parent) {
        parent.addChild(resource);
        this.tree.setUpdatedAt();
      }
    }
  }

  updateResource(oldResource: KubeResource, newResource: KubeResource) {
    const parentUid = newResource.parentIds && newResource.parentIds.length > 0 ? newResource.parentIds[0] : null;
    const parent = parentUid ? this.tree.findNodeById(parentUid) : this.tree.root;

    if (newResource.name === "flux-system" && newResource.kind === RESOURCE_TYPE.KUSTOMIZATION) {
      this.tree.root.update(newResource);
      return;
    }
    const idx = parent.children.findIndex(child => child.uid === oldResource.uid);
    if (idx !== -1) {
      const existingResource = parent.children[idx];
      existingResource.update(newResource);
      parent.lastUpdatedAt = new Date();
      this.tree.setUpdatedAt();
    }
  }

  removeResource(resource: KubeResource) {
    const parentUid = resource.parentIds && resource.parentIds.length > 0 ? resource.parentIds[0] : null;
    if (!parentUid) {
      return;
    }

    const parentNode = this.tree.findNodeById(parentUid);
    if (parentNode) {
      parentNode.removeChild(resource);
      this.tree.setUpdatedAt();
    };
  }

  findKustomizationByName(name?: string): Kustomization | null {
    if (!name) {
      return null;
    }
    const fluxResource = this.applications.find(app => app.name === name && app.kind === RESOURCE_TYPE.KUSTOMIZATION) || null;
    return fluxResource as Kustomization;
  }

  findRepositoryByNameAndKind(name?: string, kind?: string): Repository | null {
    if (!name || !kind) {
      return null;
    }
    return this.repositories.find(repo => repo.name === name && repo.kind === kind) || null;
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
