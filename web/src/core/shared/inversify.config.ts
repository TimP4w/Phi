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

const container = new Container();
/* Stores */
container.bind(FluxTreeStore).toSelf().inSingletonScope();
container.bind(EventsStore).toSelf().inSingletonScope();

/* Core */
container.bind<TreeService>(TYPES.TreeService).to(TreeServiceImpl).inSingletonScope();
container.bind<ResourceService>(TYPES.ResourceService).to(ResourceServiceImpl).inSingletonScope();

/* Infra */
container.bind<WebSocketService>(TYPES.WebSocket).to(WebSocketServiceImpl).inSingletonScope();
container.bind<HttpService>(TYPES.Http).to(HttpServiceImpl).inSingletonScope();


export { container };
