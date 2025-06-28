import { HeroUIProvider } from "@heroui/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useNavigate, useHref, Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { ROUTES } from "./routes/routes.enum";
import ResourceView from "./views/resource/Resource.view";
import DashboardView from "./views/dashboard/Dashboard.view";

export default function Phi() {
  const navigate = useNavigate();

  return (
    <HeroUIProvider navigate={navigate} useHref={useHref}>
      <ReactFlowProvider>
        <Routes>
          <Route path={ROUTES.DASHBOARD} element={<DashboardView />} />
          <Route
            path={ROUTES.RESOURCE + "/:nodeUid"}
            element={<ResourceView />}
          />
        </Routes>
        <ToastContainer theme="dark" />
      </ReactFlowProvider>
    </HeroUIProvider>
  );
}
