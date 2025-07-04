import { container } from "../../shared/inversify.config";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import { ResourceService } from "../services/resource.service";
import { addToast } from "@heroui/react";

export class SuspendUseCase extends UseCase<string, Promise<void>> {

  private readonly resourceService = container.get<ResourceService>(TYPES.ResourceService);

  public async execute(uid: string): Promise<void> {
    try {
      const result = await this.resourceService.suspend(uid);
      addToast({
        title: "Suspended sync",
        color: "success",
      });
      return result;
    } catch (error) {
      console.error('Failed to suspend ', error);
      addToast({
        title: "Failed to suspend",
        color: "danger",
      });
      return Promise.reject(error);
    }
  }
}

export const suspendUseCase = new SuspendUseCase();
