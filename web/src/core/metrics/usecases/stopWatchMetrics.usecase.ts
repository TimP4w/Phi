import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { WebSocketService } from "../../realtime/services/webSocket.service";
import { REALTIME_CONST } from "../../realtime/constants/realtime.const";
import { MetricsChannel } from "./watchMetrics.usecase";

@injectable()
export class StopWatchMetricsUseCase extends UseCase<MetricsChannel, void> {
  constructor(@inject(TYPES.WebSocket) private readonly realtimeService: WebSocketService) {
    super();
  }

  public execute(channel: MetricsChannel): void {
    this.realtimeService.sendMessage({
      type: REALTIME_CONST.STOP_WATCH_METRICS,
      message: { channel },
    });
  }
}
