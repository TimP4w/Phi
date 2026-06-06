import { inject, injectable } from 'inversify';
import type { ResourceService } from '../resource.service';
import type { HttpService } from '../../../http/services/http.service';
import { TYPES } from '../../../shared/types';

@injectable()
class ResourceServiceImpl implements ResourceService {
  constructor(@inject(TYPES.Http) private readonly httpService: HttpService) {}

  async describe(uid: string): Promise<string> {
    return await this.httpService.getYAML(`/api/resource/${uid}/describe`);
  }

  async reconcile(uid: string): Promise<void> {
    await this.httpService.patch(`/api/resource/${uid}/reconcile`, {});
  }

  async suspend(uid: string): Promise<void> {
    await this.httpService.patch(`/api/resource/${uid}/suspend`, {});
  }

  async resume(uid: string): Promise<void> {
    await this.httpService.patch(`/api/resource/${uid}/resume`, {});
  }
}

export { ResourceServiceImpl };
