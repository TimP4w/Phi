import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { ResourceService } from "../services/resource.service";
import type { Notifier } from "../../shared/notifier";

@injectable()
export class SuspendUseCase extends UseCase<string, Promise<void>> {
  constructor(
    @inject(TYPES.ResourceService) private readonly resourceService: ResourceService,
    @inject(TYPES.Notifier) private readonly notifier: Notifier,
  ) {
    super();
  }

  public async execute(uid: string): Promise<void> {
    try {
      const result = await this.resourceService.suspend(uid);
      this.notifier.success("Suspended sync");
      return result;
    } catch (error) {
      console.error('Failed to suspend ', error);
      this.notifier.error("Failed to suspend");
      return Promise.reject(error);
    }
  }
}
