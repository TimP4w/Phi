import { TreeService } from '../tree.service';
import { HttpService } from '../../../http/services/http.service';
import { container } from '../../../shared/inversify.config';
import { TYPES } from '../../../shared/types';
import { KubeEvent } from '../../models/kubeEvent';
import { injectable } from 'inversify';

@injectable()
class TreeServiceImpl implements TreeService {
  private readonly httpService: HttpService = container.get<HttpService>(TYPES.Http);

  constructor() { }

  async getEvents(): Promise<KubeEvent[]> {
    const eventsDto = await this.httpService.get<KubeEvent[]>(`/api/events`);
    return eventsDto.map(dto => new KubeEvent(dto));
  }
}

export { TreeServiceImpl };
