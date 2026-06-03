import { KubeEvent } from '../models/kubeEvent';

export interface TreeService {
  getEvents(): Promise<KubeEvent[]>;
}
