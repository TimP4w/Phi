import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { ResourceService } from "../services/resource.service";
import type { Notifier } from "../../shared/notifier";

@injectable()
export class ResumeUseCase extends UseCase<string, Promise<void>> {
  constructor(
    @inject(TYPES.ResourceService) private readonly resourceService: ResourceService,
    @inject(TYPES.Notifier) private readonly notifier: Notifier,
  ) {
    super();
  }

  public async execute(uid: string): Promise<void> {
    try {
      const result = await this.resourceService.resume(uid);
      this.notifier.success("Resumed sync");
      return result;
    } catch (error) {
      this.notifier.error("Failed to resume");
      console.error('Failed to resume ', error);
      return Promise.reject(error);
    }
  }
}
