import { container } from "../../shared/inversify.config";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import { TreeService } from "../services/tree.service";
import { FluxTreeStore } from "../stores/fluxTree.store";
import { addToast } from "@heroui/react";

export class FetchTreeUseCase extends UseCase<void, Promise<void>> {

  private readonly fluxTreeStore = container.get<FluxTreeStore>(FluxTreeStore);
  private readonly treeService = container.get<TreeService>(TYPES.TreeService);

  public async execute(): Promise<void> {
    try {
      const tree = await this.treeService.getTree();
      this.fluxTreeStore.setTree(tree);
      return Promise.resolve();
    } catch (error) {
      addToast({
        title: "Failed to fetch tree data",
        color: "danger",
      });
      console.error('Failed to fetch tree data:', error);
      return Promise.reject(error);
    }
  }
}

export const fetchTreeUseCase = new FetchTreeUseCase();
