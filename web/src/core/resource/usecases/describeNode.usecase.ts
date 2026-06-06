import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { ResourceService } from "../services/resource.service";
import { addToast } from "@heroui/react";

@injectable()
export class DescribeNodeUseCase extends UseCase<string, Promise<string>> {
  constructor(@inject(TYPES.ResourceService) private readonly resourceService: ResourceService) {
    super();
  }

  public async execute(uid: string): Promise<string> {
    try {
      return await this.resourceService.describe(uid);
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
