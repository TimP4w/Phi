import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { TrivyService } from "../services/trivy.service";
import { TrivyFindings } from "../models/trivyFindings";

@injectable()
export class GetTrivyFindingsUseCase extends UseCase<string, Promise<TrivyFindings>> {
  constructor(
    @inject(TYPES.TrivyService) private readonly trivyService: TrivyService,
  ) {
    super();
  }

  // No notify on failure: callers fetch reports in bulk and handle per-report
  // failures themselves, so a toast each would flood the UI.
  public execute(reportUid: string): Promise<TrivyFindings> {
    return this.trivyService.getFindings(reportUid);
  }
}
