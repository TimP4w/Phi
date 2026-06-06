import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { WebSocketService } from "../../realtime/services/webSocket.service";
import { REALTIME_CONST } from "../../realtime/constants/realtime.const";
import { KubeResource } from "../../fluxTree/models/tree";
import { RESOURCE_TYPE } from "../../fluxTree/constants/resources.const";

@injectable()
export class WatchLogsUseCase extends UseCase<KubeResource, Promise<void>> {
  constructor(@inject(TYPES.WebSocket) private readonly realtimeService: WebSocketService) {
    super();
  }

  public async execute(node: KubeResource): Promise<void> {
    if (!node) {
      return Promise.reject(new Error('Node is not defined'));
    }
    if (node.kind !== RESOURCE_TYPE.POD) {
      return Promise.reject(new Error('Node is not a Pod'));
    }
    this.realtimeService.sendMessage({
      type: REALTIME_CONST.START_WATCH_LOGS,
      message: node.uid,
    });
  }
}
