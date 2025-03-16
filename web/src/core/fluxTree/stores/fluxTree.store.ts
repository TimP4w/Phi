import 'reflect-metadata';

import { makeAutoObservable } from "mobx";
import { injectable } from 'inversify';
import { Log, Repository, SourceRef, Tree, TreeNode } from '../models/tree';

@injectable()
class FluxTreeStore {
  tree = new Tree(new TreeNode());
  selectedNode: TreeNode | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get root(): TreeNode {
    return this.tree.root;
  }

  get applications(): TreeNode[] {
    return this.tree.getApplicationNodes().sort((a, b) => a.name.localeCompare(b.name));
  }

  get repositories(): Repository[] {
    return this.tree.getRepositories().sort((a, b) => a.name.localeCompare(b.name));
  }

  findRepositoryByRef(ref: SourceRef): Repository | null {
    const found = this.repositories.find((repo) => repo.name === ref.name && repo.kind === ref.kind);
    if (!found) {
      return null;
    }
    return found;
  }

  nodeByUid(uid: string): TreeNode {
    return this.tree.findNodeById(uid);
  }

  setTree(tree: Tree) {
    this.tree = tree;
  }

  setSelectedNode(node: TreeNode | null) {
    this.selectedNode = node;
  }

  appendLog(log: Log) {
    if (!this.selectedNode) {
      return;
    }
    const newNode = { ...this.selectedNode };
    newNode.logs.push(log);
    this.selectedNode = newNode;
  }

}

export { FluxTreeStore };
