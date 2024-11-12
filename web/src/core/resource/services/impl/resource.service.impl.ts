import { injectable } from 'inversify/lib/annotation/injectable';
import { ResourceService } from '../resource.service';
import { HttpService } from '../../../http/services/http.service';
import { container } from '../../../shared/inversify.config';
import { TYPES } from '../../../shared/types';

@injectable()
class ResourceServiceImpl implements ResourceService {
  private readonly httpService: HttpService = container.get<HttpService>(TYPES.Http);

  constructor() { }

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
