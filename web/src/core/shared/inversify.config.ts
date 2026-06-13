import { Container } from "inversify";
import { TYPES } from "./types";
import { FluxTreeStore } from "../fluxTree/stores/fluxTree.store";
import { WebSocketServiceImpl } from "../../infrastructure/backend/websocket/services/impl/webSocket.service.impl";
import { WebSocketService } from "../realtime/services/webSocket.service";
import { HttpService } from "../http/services/http.service";
import { HttpServiceImpl } from "../../infrastructure/backend/http/services/impl/http.service.impl";
import { TreeService } from '../fluxTree/services/tree.service';
import { TreeServiceImpl } from '../fluxTree/services/impl/tree.service.impl';
import { ResourceService } from '../resource/services/resource.service';
import { ResourceServiceImpl } from "../resource/services/impl/resource.service.impl";
import { EventsStore } from "../fluxTree/stores/events.store";
import { ReconcileUseCase } from "../resource/usecases/reconcile.usecase";
import { SuspendUseCase } from "../resource/usecases/suspend.usecase";
import { ResumeUseCase } from "../resource/usecases/resume.usecase";
import { WatchLogsUseCase } from "../resource/usecases/watchLogs.usecase";
import { DescribeNodeUseCase } from "../resource/usecases/describeNode.usecase";
import { FetchEventsUseCase } from "../fluxTree/usecases/FetchEvents.usecase";
import { LayoutTreeUseCase } from "../fluxTree/usecases/LayoutTree.usecase";
import { HandleWsMessageUseCase } from "../realtime/usecases/handleWsMessage.usecase";
import { MetricsStore } from "../metrics/stores/metrics.store";
import { WatchMetricsUseCase } from "../metrics/usecases/watchMetrics.usecase";
import { StopWatchMetricsUseCase } from "../metrics/usecases/stopWatchMetrics.usecase";

const container = new Container();

/* Stores */
container.bind(FluxTreeStore).toSelf().inSingletonScope();
container.bind(EventsStore).toSelf().inSingletonScope();
container.bind(MetricsStore).toSelf().inSingletonScope();

/* Core */
container.bind<TreeService>(TYPES.TreeService).to(TreeServiceImpl).inSingletonScope();
container.bind<ResourceService>(TYPES.ResourceService).to(ResourceServiceImpl).inSingletonScope();

/* Infra */
container.bind<WebSocketService>(TYPES.WebSocket).to(WebSocketServiceImpl).inSingletonScope();
container.bind<HttpService>(TYPES.Http).to(HttpServiceImpl).inSingletonScope();

/* Use cases */
container.bind(TYPES.ReconcileUseCase).to(ReconcileUseCase).inSingletonScope();
container.bind(TYPES.SuspendUseCase).to(SuspendUseCase).inSingletonScope();
container.bind(TYPES.ResumeUseCase).to(ResumeUseCase).inSingletonScope();
container.bind(TYPES.WatchLogsUseCase).to(WatchLogsUseCase).inSingletonScope();
container.bind(TYPES.DescribeNodeUseCase).to(DescribeNodeUseCase).inSingletonScope();
container.bind(TYPES.FetchEventsUseCase).to(FetchEventsUseCase).inSingletonScope();
container.bind(TYPES.LayoutTreeUseCase).to(LayoutTreeUseCase).inSingletonScope();
container.bind(TYPES.HandleWsMessageUseCase).to(HandleWsMessageUseCase).inSingletonScope();
container.bind(TYPES.WatchMetricsUseCase).to(WatchMetricsUseCase).inSingletonScope();
container.bind(TYPES.StopWatchMetricsUseCase).to(StopWatchMetricsUseCase).inSingletonScope();

export { container };
