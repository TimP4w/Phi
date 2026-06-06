import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { ResourceService } from "../services/resource.service";
import { addToast } from "@heroui/react";

@injectable()
export class SuspendUseCase extends UseCase<string, Promise<void>> {
  constructor(@inject(TYPES.ResourceService) private readonly resourceService: ResourceService) {
    super();
  }

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
