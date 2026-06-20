import { RouterProvider, Toast } from "@heroui/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useNavigate, useHref, Routes, Route } from "react-router-dom";
import { ROUTES } from "./routes/routes.enum";
import ResourceView from "./views/resource/Resource.view";
import DashboardView from "./views/dashboard/Dashboard.view";
import CommandPalette from "./components/command-palette/CommandPalette";
import ConnectionToastManager from "./components/connection/ConnectionToast";

export default function Phi() {
  const navigate = useNavigate();

  return (
    <RouterProvider navigate={navigate} useHref={useHref}>
      <Toast.Provider placement="bottom end" />
      <ConnectionToastManager />
      <ReactFlowProvider>
        <CommandPalette />
        <Routes>
          <Route path={ROUTES.DASHBOARD} element={<DashboardView />} />
          <Route
            path={ROUTES.RESOURCE + "/:nodeUid/:view?"}
            element={<ResourceView />}
          />
        </Routes>
      </ReactFlowProvider>
    </RouterProvider>
  );
}
