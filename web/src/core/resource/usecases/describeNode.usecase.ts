import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { ResourceService } from "../services/resource.service";
import type { Notifier } from "../../shared/notifier";

@injectable()
export class DescribeNodeUseCase extends UseCase<string, Promise<string>> {
  constructor(
    @inject(TYPES.ResourceService) private readonly resourceService: ResourceService,
    @inject(TYPES.Notifier) private readonly notifier: Notifier,
  ) {
    super();
  }

  public async execute(uid: string): Promise<string> {
    try {
      return await this.resourceService.describe(uid);
    } catch (error) {
      this.notifier.error("Failed to fetch tree data");
      console.error('Failed to fetch tree data:', error);
      return Promise.reject(error);
    }
  }
}
