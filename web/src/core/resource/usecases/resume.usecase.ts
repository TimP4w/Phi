import { container } from "../../shared/inversify.config";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import { ResourceService } from "../services/resource.service";
import { addToast } from "@heroui/react";

export class ResumeUseCase extends UseCase<string, Promise<void>> {

  private readonly resourceService = container.get<ResourceService>(TYPES.ResourceService);

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

export const resumeUseCase = new ResumeUseCase();
