import { toast } from "react-toastify";
import { container } from "../../shared/inversify.config";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import { ResourceService } from "../services/resource.service";

export class DescribeNodeUseCase extends UseCase<string, Promise<string>> {

  private readonly resourceService = container.get<ResourceService>(TYPES.ResourceService);

  public async execute(uid: string): Promise<string> {
    try {
      return await this.resourceService.describe(uid);
    } catch (error) {
      toast("Failed to fetch tree data", { type: "error", theme: "dark" });
      console.error('Failed to fetch tree data:', error);
      return Promise.reject(error);
    }
  }
}

export const describeNodeUseCase = new DescribeNodeUseCase();
