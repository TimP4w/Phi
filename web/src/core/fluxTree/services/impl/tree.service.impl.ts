import type { TreeService } from '../tree.service';
import type { HttpService } from '../../../http/services/http.service';
import { TYPES } from '../../../shared/types';
import { KubeEvent } from '../../models/kubeEvent';
import { inject, injectable } from 'inversify';

@injectable()
class TreeServiceImpl implements TreeService {
  constructor(@inject(TYPES.Http) private readonly httpService: HttpService) {}

  async getEvents(): Promise<KubeEvent[]> {
    const eventsDto = await this.httpService.get<KubeEvent[]>(`/api/events`);
    return eventsDto.map(dto => new KubeEvent(dto));
  }
}

export { TreeServiceImpl };
