import "reflect-metadata";
import "@xyflow/react/dist/style.css";
import React, { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { useParams } from "react-router-dom";
import {
  FluxResource,
  Kustomization,
  KubeResource,
} from "../../../core/fluxTree/models/tree";
import {
  Spacer,
  useDisclosure,
  Card,
  CardBody,
  CardHeader,
  Tab,
  Tabs,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
} from "@heroui/react";
import AppLogo from "../../components/resource-icon/ResourceIcon";
import ResourceDrawer from "../../components/panel/ResourceDrawer";
import Header from "../../components/layout/Header";
import RenderTreeNode from "../../components/resource-tree/ResourceTree";
import ReconcileSuspendButtonGroup from "../../components/play-pause/ReconcileSuspendButtonGroup";
import { Info } from "lucide-react";
import { fetchTreeUseCase } from "../../../core/fluxTree/usecases/FetchTree.usecase";
import StatusChip from "../../components/status-chip/StatusChip";
import FluxChainWidget from "../../components/widgets/FluxChainWidget";
import ConnectedGraph from "../../components/connected-graph/ConnectedGraph";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import KustomizationSourceWidget from "../../components/widgets/KustomizationSourceWidget";
import HelmReleaseSourceWidget from "../../components/widgets/HelmReleaseSourceWidget";
import FluxSyncStatusWidget from "../../components/widgets/FluxSyncStatusWidget";
import ResourceStatusWidget from "../../components/widgets/ResourceStatusWidget";
import ResourceCountWidget from "../../components/widgets/ResourcesCountWidget";

const ResourceView: React.FC = observer(() => {
  const [loading, setLoading] = useState(true);
  const [resource, setResource] = useState<KubeResource | undefined>();
  const { nodeUid } = useParams();
  const fluxTreeStore = useInjection(FluxTreeStore);

  const [selectedNode, setSelectedNode] = useState<KubeResource | undefined>(
    undefined
  );

  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  useEffect(() => {
    if (resource) {
      // Don't fetch the tree if we already have a node, since the tree should be updated via WS anyway.
      return;
    }
    fetchTreeUseCase.execute().finally(() => {
      setLoading(false);
    });
  }, [nodeUid, resource]);

  useEffect(() => {
    if (!loading) {
      try {
        const foundNode = fluxTreeStore.tree.findNodeById(nodeUid);
        setResource(foundNode);
      } catch (e) {
        console.error(e);
      }
    }
  }, [fluxTreeStore.tree, loading, nodeUid]);

  const showResourcesCountWidget = useMemo((): boolean => {
    if (!resource) {
      return false;
    }
    return true;
  }, [resource]);

  const showFluxSyncStatusWidget = useMemo((): boolean => {
    if (!resource) {
      return false;
    }
    return resource instanceof FluxResource;
  }, [resource]);

  const showKustomizationSourceWidget = useMemo((): boolean => {
    if (!resource) {
      return false;
    }
    return resource.kind === RESOURCE_TYPE.KUSTOMIZATION;
  }, [resource]);

  const showHelmReleaseSourceWidget = useMemo((): boolean => {
    if (!resource) {
      return false;
    }
    return resource.kind === RESOURCE_TYPE.HELM_RELEASE;
  }, [resource]);

  const showResourceStatusWidget = useMemo((): boolean => {
    if (!resource) {
      return false;
    }
    return !(resource instanceof FluxResource);
  }, [resource]);

  return (
    <div className="min-h-screen bg-background">
      <Header showBackButton>
        {resource instanceof FluxResource && resource?.isReconcillable && (
          <div>
            <ReconcileSuspendButtonGroup resource={resource as FluxResource} />
          </div>
        )}
        <Button
          size="sm"
          variant="flat"
          onPress={() => {
            setSelectedNode(resource);
            onOpen();
          }}
        >
          <Info className="h-4 w-4 mr-1" />
          Info
        </Button>
      </Header>
      <main className="max-w-[1400px] py-6 px-8 transition-all duration-300 flex flex-col mr-auto ml-auto">
        <Breadcrumbs>
          <BreadcrumbItem href="/">Applications</BreadcrumbItem>
          <BreadcrumbItem>{resource?.name}</BreadcrumbItem>
        </Breadcrumbs>
        <Spacer y={8} />

        <div className="flex flex-col">
          <div className="flex flex-row gap-3 items-center">
            <AppLogo kind={resource?.kind} />
            <span className="text-3xl font-bold">{resource?.name}</span>
            <StatusChip resource={resource} />
          </div>
          <span className="text-default-400">
            {resource?.kind} in {resource?.namespace} namespace
          </span>
        </div>
        <Spacer y={3} />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {showKustomizationSourceWidget && (
            <KustomizationSourceWidget resource={resource as Kustomization} />
          )}
          {showHelmReleaseSourceWidget && (
            <HelmReleaseSourceWidget resource={resource as Kustomization} />
          )}
          <FluxChainWidget resource={resource} />
          {showFluxSyncStatusWidget && (
            <FluxSyncStatusWidget resource={resource as FluxResource} />
          )}
          {showResourceStatusWidget && (
            <ResourceStatusWidget resource={resource} />
          )}
          {showResourcesCountWidget && (
            <ResourceCountWidget resource={resource} skipGrandChildren />
          )}
        </div>
        <Spacer y={4} />
        <Card className="min-h-[600px] min-w-[400px] p-3">
          <CardHeader className="absolute">
            <div className="flex flex-col">
              <span className="font-bold text-2xl">Resource Hierarchy</span>
              <span className="text-default-400 text-sm">
                Click on any resource to view detailed information and perform
                actions
              </span>
            </div>
          </CardHeader>
          <CardBody className="p-0 m-0 pt-8 z-10">
            <Tabs placement="top" className="flex justify-end pr-3">
              <Tab key="graph" title="Graph View" className="p-0 m-0">
                <Card
                  className="flex-row min-h-[600px] min-w-[400px]"
                  shadow="none"
                >
                  <CardBody>
                    <ConnectedGraph
                      onResourceClick={(resource) => {
                        setSelectedNode(resource);
                        onOpen();
                      }}
                      rootResource={resource}
                    />
                  </CardBody>
                </Card>
              </Tab>
              <Tab key="tree" title="Tree View">
                <div className="space-y-4">
                  <RenderTreeNode
                    resource={resource}
                    level={0}
                    onResourceClick={(node) => {
                      setSelectedNode(node);
                      onOpen();
                    }}
                  ></RenderTreeNode>
                </div>
              </Tab>
            </Tabs>
          </CardBody>
        </Card>
      </main>
      <ResourceDrawer
        node={selectedNode}
        onOpenChange={onOpenChange}
        isOpen={isOpen}
      />
    </div>
  );
});

export default ResourceView;
