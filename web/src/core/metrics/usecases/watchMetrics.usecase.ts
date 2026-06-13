import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { WebSocketService } from "../../realtime/services/webSocket.service";
import { REALTIME_CONST } from "../../realtime/constants/realtime.const";

export type MetricsChannel = "tree" | "dashboard" | "detail";

export interface MetricsSubscription {
  channel: MetricsChannel;
  uids?: string[];
  nodes?: boolean;
  uid?: string;
}

@injectable()
export class WatchMetricsUseCase extends UseCase<MetricsSubscription, void> {
  constructor(@inject(TYPES.WebSocket) private readonly realtimeService: WebSocketService) {
    super();
  }

  public execute(subscription: MetricsSubscription): void {
    this.realtimeService.sendMessage({
      type: REALTIME_CONST.START_WATCH_METRICS,
      message: subscription,
    });
  }
}
