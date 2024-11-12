import { container } from "../../shared/inversify.config";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import { WebSocketService } from "../../realtime/services/webSocket.service";
import { REALTIME_CONST } from "../../realtime/constants/realtime.const";
import { TreeNode } from "../../fluxTree/models/tree";
import { RESOURCE_TYPE } from "../../fluxTree/constants/resources.const";

export class WatchLogsUseCase extends UseCase<TreeNode, Promise<void>> {

  private readonly realtimeService = container.get<WebSocketService>(TYPES.WebSocket);

  public async execute(node: TreeNode): Promise<void> {
    try {
      if (!node) {
        return Promise.reject('Node is not defined');
      }
      if (node.kind !== RESOURCE_TYPE.POD) {
        return Promise.reject('Node is not a Pod');
      }
      this.realtimeService.sendMessage({
        type: REALTIME_CONST.START_WATCH_LOGS,
        message: node.uid,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

export const watchLogsUseCase = new WatchLogsUseCase();
