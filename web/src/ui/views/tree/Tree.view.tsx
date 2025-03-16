import "reflect-metadata";
import "@xyflow/react/dist/style.css";
import React, { useEffect, useMemo, useState } from "react";
import "./tree.scss";
import { observer } from "mobx-react-lite";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { useParams } from "react-router-dom";
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
import Tag from "../../components/tag/Tag";
import StatusCircle from "../../components/status-circle/StatusCircle";
import { Panel } from "../../components/panel/Panel";
import ConditionTag from "../../components/condition-tag/ConditionTag";
import {
  TreeNode,
  VizualizationNodeData,
} from "../../../core/fluxTree/models/tree";
import Deployment from "../../components/object/Deployment";
import Pod from "../../components/object/Pod";
import PlayPause from "../../components/play-pause/PlayPause";

const TreeView: React.FC = observer(() => {
  const { nodeUid } = useParams();
  const fluxTreeStore = useInjection(FluxTreeStore);
  const [nodes, setNodes, onNodesChange] = useNodesState<
    Node<VizualizationNodeData>
  >([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [currentNode, setCurrentNode] = useState<TreeNode | null>(null);

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

  return (
    <div className="tree-view">
      <div className="tree-view__header">
        <div className="tree-view__status">
          <StatusCircle status={node?.status} />
        </div>
        <span className="tree-view__node-name">
          {fluxTreeStore.tree.findNodeById(nodeUid)?.name || "Tree"}
        </span>
        <div className="tree-view__node-kind">
          <Tag>{node.kind}</Tag>
        </div>
        <div className="tree-view__node-conditions">
          {node.conditions.map((condition, index) => (
            <div className="tree-view__node-conditions-condition">
              <div className="tree-view__node-conditions-condition-status">
                <ConditionTag key={index.toString()} condition={condition} />
              </div>
              <span className="tree-view__node-conditions-condition-reason">
                {condition.reason}
              </span>
              <span className="tree-view__node-conditions-condition-message">
                {condition.message}
              </span>
            </div>
          ))}
        </div>
        {node.isReconcillable && <PlayPause node={node} />}
      </div>
      <div className="tree-view__apps">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          nodeTypes={nodeTypes}
          minZoom={0.2}
          maxZoom={4}
          onNodeClick={(_, node) => {
            setCurrentNode(node.data.treeNode);
            setIsPanelOpen(true);
          }}
          nodesDraggable={false}
          colorMode={"dark"}
        >
          <MiniMap />
          <Controls />
        </ReactFlow>
      </div>
      <Panel
        isOpen={isPanelOpen}
        node={fluxTreeStore.tree.findNodeById(currentNode?.uid)}
        onClose={() => {
          setIsPanelOpen(false);
        }}
      />
    </div>
  );
});

export default TreeView;
