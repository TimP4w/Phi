import { EventDto } from "./dtos/eventDto";

export class KubeEvent {
  uid: string;
  kind: string;
  name: string;
  namespace: string;
  reason: string;
  message: string;
  source: string;
  type: 'Normal' | 'Warning';
  firstObserved: Date;
  lastObserved: Date;
  count: number;
  resourceUID: string;

  constructor(dto: EventDto) {
    this.uid = dto.uid;
    this.kind = dto.kind;
    this.name = dto.name;
    this.namespace = dto.namespace;
    this.reason = dto.reason;
    this.message = dto.message;
    this.source = dto.source;
    this.type = dto.type === 'Normal' ? 'Normal' : 'Warning';
    this.firstObserved = new Date(dto.firstObserved);
    this.lastObserved = new Date(dto.lastObserved);
    this.count = dto.count;
    this.resourceUID = dto.resourceUID;
  }

}
