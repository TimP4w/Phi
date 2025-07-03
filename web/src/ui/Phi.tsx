import { HeroUIProvider, ToastProvider } from "@heroui/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useNavigate, useHref, Routes, Route } from "react-router-dom";
import { ROUTES } from "./routes/routes.enum";
import ResourceView from "./views/resource/Resource.view";
import DashboardView from "./views/dashboard/Dashboard.view";

export default function Phi() {
  const navigate = useNavigate();

  return (
    <HeroUIProvider navigate={navigate} useHref={useHref}>
      <ToastProvider
        placement="top-center"
        toastProps={{
          radius: "md",
          color: "primary",
          variant: "flat",
          timeout: 2500,
          hideIcon: true,
          classNames: {
            closeButton:
              "opacity-100 absolute right-4 top-1/2 -translate-y-1/2",
          },
        }}
      />
      <ReactFlowProvider>
        <Routes>
          <Route path={ROUTES.DASHBOARD} element={<DashboardView />} />
          <Route
            path={ROUTES.RESOURCE + "/:nodeUid"}
            element={<ResourceView />}
          />
        </Routes>
      </ReactFlowProvider>
    </HeroUIProvider>
  );
}
