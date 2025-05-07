import "reflect-metadata";
import "@xyflow/react/dist/style.css";
import React, { useEffect, useMemo, useState } from "react";
import "./tree.scss";
import { observer } from "mobx-react-lite";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { Link, useParams } from "react-router-dom";
import {
  Controls,
  Edge,
  MiniMap,
  Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import Resource from "../../components/object/Resource";
import { layoutTreeUseCase } from "../../../core/fluxTree/usecases/LayoutTree.usecase";
import {
  HelmReleaseNode,
  ResourceStatus,
  TreeNode,
  VizualizationNodeData,
} from "../../../core/fluxTree/models/tree";
import Deployment from "../../components/object/Deployment";
import Pod from "../../components/object/Pod";
import { Badge, Avatar, Spacer, useDisclosure, Chip } from "@heroui/react";
import AppLogo from "../../components/app-logo/AppLogo";
import ConditionAlert from "../../components/condition-alert/ConditionAlert";
import ResourceDrawer from "../../components/object/ResourceDrawer";
import { WebSocketService } from "../../../core/realtime/services/webSocket.service";
import { TYPES } from "../../../core/shared/types";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { describeNodeUseCase } from "../../../core/resource/usecases/describeNode.usecase";
import { watchLogsUseCase } from "../../../core/resource/usecases/watchLogs.usecase";

const TreeView: React.FC = observer(() => {
  const { nodeUid } = useParams();
  const fluxTreeStore = useInjection(FluxTreeStore);
  const [nodes, setNodes, onNodesChange] = useNodesState<
    Node<VizualizationNodeData>
  >([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const realtimeService = useInjection<WebSocketService>(TYPES.WebSocket);

  const [selectedNode, setSelectedNode] = useState<TreeNode | undefined>(
    undefined
  );
  const [selectedNodeDescribe, setSelectedNodeDescribe] = useState<string>("");

  useEffect(() => {
    // TODO: Re-fetch / reassign the selected node, when the tree is updated
    if (selectedNode && selectedNode.kind === RESOURCE_TYPE.POD) {
      // TODO: setSelectedNode is only used for logs. Maybe do that in the watchLogsUseCase?
      fluxTreeStore.setSelectedNode(selectedNode);
      watchLogsUseCase.execute(selectedNode);
    }

    const fetchYAML = async () => {
      if (!selectedNode) {
        return;
      }
      const describe = await describeNodeUseCase.execute(selectedNode.uid);
      setSelectedNodeDescribe(describe);
      console.log("Fetched YAML");
    };

    if (selectedNode) {
      fetchYAML();
    }
  }, [selectedNode, fluxTreeStore, realtimeService]);

  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const nodeTypes = useMemo(
    () => ({ resource: Resource, deployment: Deployment, pod: Pod }),
    []
  );

  const node = useMemo(
    () => fluxTreeStore.tree.findNodeById(nodeUid),
    [nodeUid, fluxTreeStore.tree]
  );

  useEffect(() => {
    layoutTreeUseCase
      .execute({ nodeId: nodeUid || "", currentLayout: nodes })
      .then(({ nodes, edges }) => {
        setNodes(nodes);
        setEdges(edges);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fluxTreeStore.tree, nodeUid, setEdges, setNodes]);

  const colorByStatus = (status: ResourceStatus) => {
    switch (status) {
      case ResourceStatus.SUCCESS:
        return "success";
      case ResourceStatus.FAILED:
        return "danger";
      case ResourceStatus.PENDING:
        return "warning";
      default:
        return "primary";
    }
  };

  return (
    <div className="h-screen">
      <div className="flex p-4 h-auto items-center">
        <div className="flex gap-3">
          <Badge
            color={colorByStatus(node.status)}
            content={node.fluxMetadata?.isSuspended ? "suspended" : " "}
            className="border-transparent"
          >
            <Avatar
              isBordered
              classNames={{
                base: "bg-transparent",
                icon: "text-black/80",
              }}
              color={colorByStatus(node.status)}
              icon={<AppLogo kind={node.kind} />}
            />
          </Badge>
          <div className="flex flex-col">
            <Link key={node.uid} to={`/tree/${node.uid}`}>
              <p className="text-md underline">{node.name}</p>
            </Link>
            <p className="text-small text-default-500">{node.kind}</p>
          </div>
          {node.kind === "HelmRelease" && (
            <Chip>{(node as HelmReleaseNode).metadata?.chartVersion}</Chip>
          )}
        </div>
        <Spacer x={24} />
        <div className="flex gap-3">
          {node.conditions.map((condition, index) => (
            <div className="p-1">
              <ConditionAlert condition={condition} key={index.toString()} />
            </div>
          ))}
        </div>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        nodeTypes={nodeTypes}
        minZoom={0.2}
        maxZoom={4}
        nodesDraggable={false}
        colorMode={"dark"}
        onNodeClick={(_, node) => {
          setSelectedNode(node.data.treeNode);
          onOpen();
        }}
      >
        <MiniMap />
        <Controls />
      </ReactFlow>
      <ResourceDrawer
        node={selectedNode}
        onOpenChange={onOpenChange}
        isOpen={isOpen}
        describe={selectedNodeDescribe}
      />
    </div>
  );
});

export default TreeView;
