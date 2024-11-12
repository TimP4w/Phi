import { toast } from "react-toastify";
import { container } from "../../shared/inversify.config";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import { ResourceService } from "../services/resource.service";

export class ReconcileUseCase extends UseCase<string, Promise<void>> {

  private readonly resourceService = container.get<ResourceService>(TYPES.ResourceService);

  public async execute(uid: string): Promise<void> {
    try {
      const result = await this.resourceService.reconcile(uid);
      toast("Reconciliation Started", { type: "success", theme: "dark" });
      return result;
    } catch (error) {
      toast("Failed to start reconciliation", { type: "error", theme: "dark" });
      console.error('Failed to start reconciliation:', error);
      return Promise.reject(error);
    }
  }
}

export const reconcileUseCase = new ReconcileUseCase();
