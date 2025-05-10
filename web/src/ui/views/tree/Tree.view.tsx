import "reflect-metadata";
import "@xyflow/react/dist/style.css";
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
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
  useReactFlow,
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
import ResourceDrawer from "../../components/panel/ResourceDrawer";

const TreeView: React.FC = observer(() => {
  const { nodeUid } = useParams();
  const fluxTreeStore = useInjection(FluxTreeStore);
  const [nodes, setNodes, onNodesChange] = useNodesState<
    Node<VizualizationNodeData>
  >([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [selectedNode, setSelectedNode] = useState<TreeNode | undefined>(
    undefined
  );
  const { fitView } = useReactFlow();
  const [shouldLayout, setShouldLayout] = useState(false);

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
      })
      .finally(() => {
        setShouldLayout(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLayout]);

  // Trigger tree layout
  useEffect(() => {
    setShouldLayout(true);
  }, [fluxTreeStore.tree, node, fitView]);

  // Reset tree when navigating to new node
  useLayoutEffect(() => {
    setNodes([]);
    setEdges([]);
    fitView();
    setShouldLayout(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeUid]);

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
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <div className="flex flex-wrap gap-4 p-4 h-auto items-center">
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
        <div className="flex flex-wrap gap-3">
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
        // style={{ background: COLORS.BACKROUND }}
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
      />
    </div>
  );
});

export default TreeView;
