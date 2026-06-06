import "reflect-metadata";

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.scss";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "inversify-react";
import { container } from "./core/shared/inversify.config";

import Phi from "./ui/Phi";
import { FetchEventsUseCase } from "./core/fluxTree/usecases/FetchEvents.usecase";
import { Message } from "./core/realtime/models/message";
import { WebSocketService } from "./core/realtime/services/webSocket.service";
import { HandleWsMessageUseCase } from "./core/realtime/usecases/handleWsMessage.usecase";
import { TYPES } from "./core/shared/types";
import { Listener } from "./infrastructure/backend/websocket/services/impl/webSocket.service.impl";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

const realtime = container.get<WebSocketService>(TYPES.WebSocket);
realtime.connect();

const handleWsMessage = container.get<HandleWsMessageUseCase>(TYPES.HandleWsMessageUseCase);
const listener: Listener = {
  id: "1",
  handle: (data: Message) => {
    void handleWsMessage.execute(data).catch(console.error);
  },
};
realtime.addListener(listener);

const fetchEventsUseCase = container.get<FetchEventsUseCase>(TYPES.FetchEventsUseCase);
void fetchEventsUseCase.execute().catch(console.error);

root.render(
  <React.StrictMode>
    <Provider container={container}>
      <BrowserRouter>
        <Phi />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
