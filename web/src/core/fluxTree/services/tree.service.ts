import { KubeEvent } from '../models/kubeEvent';
import { Tree } from '../models/tree';

export interface TreeService {
  getTree(): Promise<Tree>;
  getEvents(): Promise<KubeEvent[]>;
}
