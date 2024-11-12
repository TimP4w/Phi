import { toast } from "react-toastify";
import { container } from "../../shared/inversify.config";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import { ResourceService } from "../services/resource.service";

export class ResumeUseCase extends UseCase<string, Promise<void>> {

  private readonly resourceService = container.get<ResourceService>(TYPES.ResourceService);

  public async execute(uid: string): Promise<void> {
    try {
      const result = await this.resourceService.resume(uid);
      toast("Resumed sync", { type: "success", theme: "dark" });
      return result;
    } catch (error) {
      toast("Failed to resume", { type: "error", theme: "dark" });
      console.error('Failed to resume ', error);
      return Promise.reject(error);
    }
  }
}

export const resumeUseCase = new ResumeUseCase();
