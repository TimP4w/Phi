import {
  Card,
  CardBody,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Tabs,
  Tab,
} from "@heroui/react";
import { KubeResource } from "../../../core/fluxTree/models/tree";
import AppLogo from "../resource-icon/ResourceIcon";
import { InfoTab } from "./InfoTab";
import { EventsTab } from "./EventsTab";
import { DescribeTab } from "./DescribeTab";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { LogsTab } from "./LogsTab";
import { useEffect, useState } from "react";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { describeNodeUseCase } from "../../../core/resource/usecases/describeNode.usecase";
import { watchLogsUseCase } from "../../../core/resource/usecases/watchLogs.usecase";
import { WebSocketService } from "../../../core/realtime/services/webSocket.service";
import { TYPES } from "../../../core/shared/types";
import StatusChip from "../status-chip/StatusChip";

type ResourceDrawerProps = {
  onOpenChange: () => void;
  isOpen: boolean;
  node?: KubeResource;
};

function ResourceDrawer({ node, onOpenChange, isOpen }: ResourceDrawerProps) {
  const fluxTreeStore = useInjection(FluxTreeStore);
  const realtimeService = useInjection<WebSocketService>(TYPES.WebSocket);
  const [selectedNodeDescribe, setSelectedNodeDescribe] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      // TODO: Re-fetch / reassign the selected node, when the tree is updated
      if (node && node.kind === RESOURCE_TYPE.POD) {
        // TODO: setSelectedNode is only used for logs. Maybe do that in the watchLogsUseCase?
        fluxTreeStore.setSelectedResource(node);
        watchLogsUseCase.execute(node);
      }

      const fetchYAML = async () => {
        if (!node) {
          return;
        }
        const describe = await describeNodeUseCase.execute(node.uid);
        setSelectedNodeDescribe(describe);
      };

      if (node) {
        fetchYAML();
      }
    }
  }, [isOpen, fluxTreeStore, realtimeService, node]);

  return (
    <Drawer
      isOpen={isOpen}
      size={"5xl"}
      onOpenChange={onOpenChange}
      className="dark"
    >
      <DrawerContent>
        {node && (
          <>
            <DrawerHeader className="flex flex-col gap-1">
              <div className="flex flex-col">
                <div className="flex flex-row gap-3 items-center">
                  <AppLogo kind={node?.kind} />
                  <span className="text-3xl font-bold">{node?.name}</span>
                  <StatusChip resource={node} />
                </div>
                <span className="self-start text-sm text-default-400">
                  {node.kind} • {node.namespace}
                </span>
              </div>
            </DrawerHeader>
            <DrawerBody>
              <Tabs aria-label="Options">
                <Tab key="infos" title="Info">
                  <Card shadow="none" radius="none">
                    <CardBody>
                      <InfoTab resource={node} />
                    </CardBody>
                  </Card>
                </Tab>
                <Tab key="events" title="Events">
                  <Card shadow="none" radius="none">
                    <CardBody>
                      <EventsTab resource={node} />
                    </CardBody>
                  </Card>
                </Tab>
                <Tab key="describe" title="Describe">
                  <Card radius="none">
                    <CardBody>
                      <DescribeTab describe={selectedNodeDescribe} />
                    </CardBody>
                  </Card>
                </Tab>
                {node && node.kind === RESOURCE_TYPE.POD && (
                  <Tab key="logs" title="Pod logs">
                    <Card>
                      <CardBody>
                        <LogsTab />
                      </CardBody>
                    </Card>
                  </Tab>
                )}
              </Tabs>
            </DrawerBody>
            <DrawerFooter></DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

export default ResourceDrawer;
