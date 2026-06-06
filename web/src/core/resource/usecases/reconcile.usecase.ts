import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { ResourceService } from "../services/resource.service";
import { addToast } from "@heroui/react";

@injectable()
export class ReconcileUseCase extends UseCase<string, Promise<void>> {
  constructor(@inject(TYPES.ResourceService) private readonly resourceService: ResourceService) {
    super();
  }

  public async execute(uid: string): Promise<void> {
    try {
      return await this.resourceService.reconcile(uid);
    } catch (error) {
      addToast({
        title: "Failed to trigger reconciliation",
        color: "danger",
      });
      console.error('Failed to start reconciliation:', error);
      return Promise.reject(error);
    }
  }
}
