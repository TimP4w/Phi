import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { ResourceService } from "../services/resource.service";
import { addToast } from "@heroui/react";

@injectable()
export class ResumeUseCase extends UseCase<string, Promise<void>> {
  constructor(@inject(TYPES.ResourceService) private readonly resourceService: ResourceService) {
    super();
  }

  public async execute(uid: string): Promise<void> {
    try {
      const result = await this.resourceService.resume(uid);
      addToast({
        title: "Resumed sync",
        color: "success",
      });
      return result;
    } catch (error) {
      addToast({
        title: "Failed to resume",
        color: "danger",
      });
      console.error('Failed to resume ', error);
      return Promise.reject(error);
    }
  }
}
