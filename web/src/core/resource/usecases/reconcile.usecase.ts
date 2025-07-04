import { container } from "../../shared/inversify.config";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import { ResourceService } from "../services/resource.service";
import { addToast } from "@heroui/react";

export class ReconcileUseCase extends UseCase<string, Promise<void>> {

  private readonly resourceService = container.get<ResourceService>(TYPES.ResourceService);

  public async execute(uid: string): Promise<void> {
    try {
      const result = await this.resourceService.reconcile(uid);
      addToast({
        title: "Reconciliation Started",
        color: "success",
      });
      return result;
    } catch (error) {
      addToast({
        title: "Failed to start reconciliation events",
        color: "danger",
      });
      console.error('Failed to start reconciliation:', error);
      return Promise.reject(error);
    }
  }
}

export const reconcileUseCase = new ReconcileUseCase();
