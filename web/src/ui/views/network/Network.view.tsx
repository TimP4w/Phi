import "reflect-metadata";
import "@xyflow/react/dist/style.css";
import React, { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { useParams, useNavigate } from "react-router-dom";
import { Breadcrumbs, BreadcrumbItem, Button, useDisclosure } from "@heroui/react";
import { Workflow } from "lucide-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { KubeResource } from "../../../core/fluxTree/models/tree";
import { ROUTES } from "../../routes/routes.enum";
import Header from "../../components/layout/Header";
import AppLogo from "../../components/resource-icon/ResourceIcon";
import StatusChip from "../../components/status-chip/StatusChip";
import ResourceDrawer from "../../components/panel/ResourceDrawer";
import NetworkGraph from "../../components/network/NetworkGraph";
import { COLOR_HEALTHY, COLOR_UNHEALTHY } from "../../../core/network/usecases/NetworkTopology.usecase";

const NetworkView: React.FC = observer(() => {
  const { nodeUid } = useParams();
  const navigate = useNavigate();
  const fluxTreeStore = useInjection(FluxTreeStore);
  const resource = fluxTreeStore.findResourceByUid(nodeUid ?? "");

  const [selectedNode, setSelectedNode] = React.useState<KubeResource | undefined>(undefined);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const openInfo = (node: KubeResource | undefined) => {
    setSelectedNode(node);
    onOpen();
  };

  const legend = useMemo(
    () => [
      { color: COLOR_HEALTHY, label: "Routable", dash: false },
      { color: COLOR_UNHEALTHY, label: "Pending / not ready", dash: true },
    ],
    [],
  );

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header showBackButton />
      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Identity bar */}
        <div className="flex-shrink-0 px-6 pt-4 pb-3 border-b border-default-100">
          <Breadcrumbs size="sm" className="mb-2">
            <BreadcrumbItem onPress={() => navigate(ROUTES.DASHBOARD)}>Cluster</BreadcrumbItem>
            <BreadcrumbItem
              onPress={() => resource && navigate(`${ROUTES.RESOURCE}/${resource.uid}`)}
            >
              {resource?.name}
            </BreadcrumbItem>
            <BreadcrumbItem>Network</BreadcrumbItem>
          </Breadcrumbs>
          <div className="flex items-center gap-3">
            <AppLogo kind={resource?.kind} />
            <div>
              <h1 className="text-xl font-bold leading-tight flex items-center gap-2">
                <Workflow className="w-5 h-5 text-default-400" />
                {resource?.name}
              </h1>
              <span className="text-default-400 text-sm">
                Traffic topology · {resource?.kind}
                {resource?.namespace ? ` · ${resource.namespace}` : ""}
              </span>
            </div>
            {resource && <StatusChip resource={resource} />}
            <Button
              size="sm"
              variant="bordered"
              className="ml-auto"
              onPress={() => resource && navigate(`${ROUTES.RESOURCE}/${resource.uid}`)}
            >
              Back to resource graph
            </Button>
          </div>
        </div>

        {/* Graph */}
        <div className="flex-1 relative min-h-0">
          {/* Legend */}
          <div className="absolute top-3 left-4 z-10 flex items-center gap-3 bg-content1/90 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-default-200 shadow-sm">
            {legend.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5 text-xs text-default-500">
                <span
                  className="inline-block w-4 h-0.5"
                  style={{
                    backgroundColor: item.color,
                    backgroundImage: item.dash
                      ? `repeating-linear-gradient(to right, ${item.color} 0 4px, transparent 4px 7px)`
                      : undefined,
                  }}
                />
                {item.label}
              </span>
            ))}
          </div>

          <div className="absolute inset-0">
            <NetworkGraph
              rootResource={resource}
              onResourceClick={(node) => openInfo(node)}
              treeSize={fluxTreeStore.resourceCount}
            />
          </div>
        </div>
      </main>

      <ResourceDrawer node={selectedNode} onOpenChange={onOpenChange} isOpen={isOpen} />
    </div>
  );
});

export default NetworkView;
