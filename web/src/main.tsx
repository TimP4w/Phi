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
import Header from "./ui/components/layout/Header";
import { ReactFlowProvider } from "@xyflow/react";
import { fetchTreeUseCase } from "./core/fluxTree/usecases/FetchTree.usecase";
import { Message } from "./core/realtime/models/message";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { library } from "@fortawesome/fontawesome-svg-core";
import { fab, faGithub } from "@fortawesome/free-brands-svg-icons";
import {
  faArrowsRotate,
  faBell,
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
  faEllipsisV,
} from "@fortawesome/free-solid-svg-icons";
import { fetchEventsUseCase } from "./core/fluxTree/usecases/FetchEvents.usecase";
import { HeroUIProvider } from "@heroui/react";

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
  faBell,
  faCloud,
  faMap,
  faGithub,
  faFilter,
  faXmark,
  faEllipsisV
);
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

// TODO: i don't really like this initialization anymore. Maybe make own singleton "InitService"?
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

// TODO: don't make this dependent on fetching the tree... show something anyway.
// TODO: show error if tree fetching fails
fetchTreeUseCase.execute().then(() => {
  root.render(
    <React.StrictMode>
      <Provider container={container}>
        <HeroUIProvider>
          <ReactFlowProvider>
            <main className="dark">
              <Header />
              <RouterProvider router={router} />
              <ToastContainer theme="dark" />
            </main>
          </ReactFlowProvider>
        </HeroUIProvider>
      </Provider>
    </React.StrictMode>
  );
});

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
