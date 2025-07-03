import "reflect-metadata";

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.scss";
import reportWebVitals from "./reportWebVitals";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "inversify-react";
import { container } from "./core/shared/inversify.config";

import Phi from "./ui/Phi";
import { fetchEventsUseCase } from "./core/fluxTree/usecases/FetchEvents.usecase";
import { Message } from "./core/realtime/models/message";
import { WebSocketService } from "./core/realtime/services/webSocket.service";
import { handleWsMessage } from "./core/realtime/usecases/handleWsMessage.usecase";
import { TYPES } from "./core/shared/types";
import { Listener } from "./infrastructure/backend/websocket/services/impl/webSocket.service.impl";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

const realtime = container.get<WebSocketService>(TYPES.WebSocket);
realtime.connect();
const listener: Listener = {
  id: "1",
  handle: (data: Message) => {
    handleWsMessage.execute(data);
  },
};
realtime.addListener(listener);
fetchEventsUseCase.execute();

root.render(
  <React.StrictMode>
    <Provider container={container}>
      <BrowserRouter>
        <Phi />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
