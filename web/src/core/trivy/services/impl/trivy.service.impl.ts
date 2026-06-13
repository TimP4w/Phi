import { inject, injectable } from "inversify";
import type { TrivyService } from "../trivy.service";
import type { HttpService } from "../../../http/services/http.service";
import { TYPES } from "../../../shared/types";
import { TrivyFindings } from "../../models/trivyFindings";

@injectable()
class TrivyServiceImpl implements TrivyService {
  constructor(@inject(TYPES.Http) private readonly httpService: HttpService) {}

  async getFindings(reportUid: string): Promise<TrivyFindings> {
    return await this.httpService.get<TrivyFindings>(
      `/api/trivy/findings/${reportUid}`,
    );
  }
}

export { TrivyServiceImpl };
