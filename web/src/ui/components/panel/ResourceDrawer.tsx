import { Drawer, DrawerContent } from "@heroui/react";
import { KubeResource } from "../../../core/fluxTree/models/tree";
import AppLogo from "../resource-icon/ResourceIcon";
import { InfoTab } from "./InfoTab";
import { DescribeTab } from "./DescribeTab";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { LogsTab } from "./LogsTab";
import { useEffect, useState } from "react";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { DescribeNodeUseCase } from "../../../core/resource/usecases/describeNode.usecase";
import { WatchLogsUseCase } from "../../../core/resource/usecases/watchLogs.usecase";
import { WebSocketService } from "../../../core/realtime/services/webSocket.service";
import { TYPES } from "../../../core/shared/types";
import StatusChip from "../status-chip/StatusChip";

type ResourceDrawerProps = {
  onOpenChange: () => void;
  isOpen: boolean;
  node?: KubeResource;
};

type TabKey = "info" | "describe" | "logs";

function ResourceDrawer({ node, onOpenChange, isOpen }: ResourceDrawerProps) {
  const fluxTreeStore = useInjection(FluxTreeStore);
  const realtimeService = useInjection<WebSocketService>(TYPES.WebSocket);
  const describeNodeUseCase = useInjection<DescribeNodeUseCase>(TYPES.DescribeNodeUseCase);
  const watchLogsUseCase = useInjection<WatchLogsUseCase>(TYPES.WatchLogsUseCase);
  const [selectedNodeDescribe, setSelectedNodeDescribe] = useState<string>("");
  const [isLoadingDescribe, setIsLoadingDescribe] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("info");

  useEffect(() => {
    if (node?.uid) setActiveTab("info");
  }, [node?.uid]);

  useEffect(() => {
    if (isOpen) {
      if (node && node.kind === RESOURCE_TYPE.POD) {
        fluxTreeStore.setSelectedResource(node);
        watchLogsUseCase.execute(node);
      }
      if (node) {
        setIsLoadingDescribe(true);
        setSelectedNodeDescribe("");
        describeNodeUseCase
          .execute(node.uid)
          .then(setSelectedNodeDescribe)
          .finally(() => setIsLoadingDescribe(false));
      }
    }
  }, [isOpen, fluxTreeStore, realtimeService, node, watchLogsUseCase, describeNodeUseCase]);

  const isPod = node?.kind === RESOURCE_TYPE.POD;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "info", label: "Info" },
    { key: "describe", label: "Describe" },
    ...(isPod ? [{ key: "logs" as TabKey, label: "Logs" }] : []),
  ];

  return (
    <Drawer isOpen={isOpen} size="5xl" onOpenChange={onOpenChange} className="dark">
      <DrawerContent>
        {node && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 border-b border-default-100">
              <div className="flex items-center gap-3">
                <AppLogo kind={node.kind} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-2xl font-bold">{node.name}</span>
                    <StatusChip resource={node} />
                  </div>
                  <span className="text-sm text-default-400">
                    {node.kind} · {node.namespace}
                  </span>
                </div>
              </div>
            </div>

            {/* Tab strip */}
            <div className="flex-shrink-0 flex gap-0 border-b border-default-100 px-6">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === tab.key
                      ? "border-primary text-primary"
                      : "border-transparent text-default-400 hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {activeTab === "info" && (
                <div className="p-6">
                  <InfoTab resource={node} />
                </div>
              )}
              {activeTab === "describe" && (
                <DescribeTab
                  describe={selectedNodeDescribe}
                  isLoading={isLoadingDescribe}
                />
              )}
              {activeTab === "logs" && isPod && <LogsTab />}
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

export default ResourceDrawer;
