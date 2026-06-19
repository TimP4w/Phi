import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { ResourceService } from "../services/resource.service";
import type { Notifier } from "../../shared/notifier";

@injectable()
export class ReconcileUseCase extends UseCase<string, Promise<void>> {
  constructor(
    @inject(TYPES.ResourceService) private readonly resourceService: ResourceService,
    @inject(TYPES.Notifier) private readonly notifier: Notifier,
  ) {
    super();
  }

  public async execute(uid: string): Promise<void> {
    try {
      return await this.resourceService.reconcile(uid);
    } catch (error) {
      this.notifier.error("Failed to trigger reconciliation");
      console.error('Failed to start reconciliation:', error);
      return Promise.reject(error);
    }
  }
}
