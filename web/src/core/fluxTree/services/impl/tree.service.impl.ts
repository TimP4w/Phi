import { TreeService } from '../tree.service';
import { Tree } from '../../models/tree';
import { HttpService } from '../../../http/services/http.service';
import { container } from '../../../shared/inversify.config';
import { TYPES } from '../../../shared/types';
import { TreeNodeDto } from '../../models/dtos/treeDto';
import { KubeEvent } from '../../models/kubeEvent';
import { injectable } from 'inversify';

@injectable()
class TreeServiceImpl implements TreeService {
  private readonly httpService: HttpService = container.get<HttpService>(TYPES.Http);

  constructor() { }

  async getTree(): Promise<Tree> {
    const rootDto = await this.httpService.get<TreeNodeDto>(`/api/tree`);
    return Tree.fromDto(rootDto);
  }

  async getEvents(): Promise<KubeEvent[]> {
    const eventsDto = await this.httpService.get<KubeEvent[]>(`/api/events`);
    return eventsDto.map(dto => new KubeEvent(dto));
  }
}

export { TreeServiceImpl };
