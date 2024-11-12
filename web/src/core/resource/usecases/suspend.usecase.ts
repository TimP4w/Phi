import { toast } from "react-toastify";
import { container } from "../../shared/inversify.config";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import { ResourceService } from "../services/resource.service";

export class SuspendUseCase extends UseCase<string, Promise<void>> {

  private readonly resourceService = container.get<ResourceService>(TYPES.ResourceService);

  public async execute(uid: string): Promise<void> {
    try {

      const result = await this.resourceService.suspend(uid);
      toast("Suspended sync", { type: "success", theme: "dark" });
      return result;
    } catch (error) {
      console.error('Failed to suspend ', error);
      toast("Failed to suspend", { type: "error", theme: "dark" });
      return Promise.reject(error);
    }
  }
}

export const suspendUseCase = new SuspendUseCase();
