import "reflect-metadata";

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.scss";
import reportWebVitals from "./reportWebVitals";
import { RouterProvider } from "react-router-dom";
import { router } from "./ui/routes/Index";
import { Provider } from "inversify-react";
import { container } from "./core/shared/inversify.config";
import { WebSocketService } from "./core/realtime/services/webSocket.service";
import { TYPES } from "./core/shared/types";
import { Listener } from "./infrastructure/backend/websocket/services/impl/webSocket.service.impl";
import { handleWsMessage } from "./core/realtime/usecases/handleWsMessage.usecase";
import Header from "./ui/components/header/Header";
import { ReactFlowProvider } from "@xyflow/react";
import { fetchTreeUseCase } from "./core/fluxTree/usecases/FetchTree.usecase";
import { Message } from "./core/realtime/models/message";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { library } from "@fortawesome/fontawesome-svg-core";
import { fab, faGithub } from "@fortawesome/free-brands-svg-icons";
import {
  faArrowsRotate,
  faBellSlash,
  faCircleCheck,
  faCircleExclamation,
  faCircleInfo,
  faCircleNotch,
  faCircleXmark,
  faCloud,
  faCodeCommit,
  faEnvelope,
  faEnvelopeCircleCheck,
  faMap,
  faPause,
  faPlay,
  faFilter,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import Footer from "./ui/components/footer/Footer";
import { fetchEventsUseCase } from "./core/fluxTree/usecases/FetchEvents.usecase";
import { EventsPanel } from "./ui/components/events-panel/EventsPanel";

library.add(
  fab,
  faArrowsRotate,
  faPlay,
  faPause,
  faCircleCheck,
  faCircleInfo,
  faCircleExclamation,
  faCircleXmark,
  faCodeCommit,
  faCircleNotch,
  faEnvelope,
  faEnvelopeCircleCheck,
  faBellSlash,
  faCloud,
  faMap,
  faGithub,
  faFilter,
  faXmark
);
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

fetchTreeUseCase.execute().then(() => {
  root.render(
    <Provider container={container}>
      <ReactFlowProvider>
        <React.StrictMode>
          <Header />
          <RouterProvider router={router} />
          <ToastContainer theme="dark" />
          <Footer />
        </React.StrictMode>
      </ReactFlowProvider>
      <EventsPanel />
    </Provider>
  );
});

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
