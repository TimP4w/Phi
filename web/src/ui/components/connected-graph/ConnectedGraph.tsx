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
import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import {
  KubeResource,
  VizualizationNodeData,
} from "../../../core/fluxTree/models/tree";
import { layoutTreeUseCase } from "../../../core/fluxTree/usecases/LayoutTree.usecase";
import Deployment from "../object/Deployment";
import Pod from "../object/Pod";
import Resource from "../object/Resource";
import { observer } from "mobx-react-lite";
import { useSubtreeUpdates } from "../../../core/utils/useSubTeeUpdates";

type ConnectedGraphProps = {
  rootResource?: KubeResource;
  onResourceClick: (resource: KubeResource) => void;
};

const ConnectedGraph: React.FC<ConnectedGraphProps> = observer(
  ({ rootResource, onResourceClick }: ConnectedGraphProps) => {
    const [nodes, setNodes, onNodesChange] = useNodesState<
      Node<VizualizationNodeData>
    >([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    const { fitView } = useReactFlow();
    const [shouldLayout, setShouldLayout] = useState(false);

    const nodeTypes = useMemo(
      () => ({ resource: Resource, deployment: Deployment, pod: Pod }),
      []
    );

    const previousRootUid = useRef<string | null>(null);

    // Reset tree when navigating to new node
    useLayoutEffect(() => {
      if (previousRootUid.current !== rootResource?.uid) {
        previousRootUid.current = rootResource?.uid ?? null;
        setNodes([]);
        setEdges([]);
        fitView();
        setShouldLayout(true);
      }
    }, [rootResource?.uid, setNodes, setEdges, fitView]);

    // Trigger layout only when rootResource is set and nodes have changed
    useEffect(() => {
      if (rootResource && shouldLayout) {
        layoutTreeUseCase
          .execute({ nodeId: rootResource.uid || "", currentLayout: nodes })
          .then(({ nodes, edges }) => {
            setNodes(nodes);
            setEdges(edges);
          })
          .finally(() => {
            setShouldLayout(false);
          });
      }
    }, [shouldLayout, rootResource, nodes, setNodes, setEdges]); // Keep `nodes` here if layout depends on current layout state

    // Trigger layout when node count changes after root is set
    useEffect(() => {
      if (rootResource && previousRootUid.current === rootResource.uid) {
        setShouldLayout(true);
      }
    }, [nodes.length, rootResource]);

    // Trigger update when subtree changes
    useSubtreeUpdates(rootResource, () => {
      if (rootResource && previousRootUid.current === rootResource.uid) {
        setShouldLayout(true);
      }
    });

    return (
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
        // style={{ background: COLORS.SECONDARY }}
        onNodeClick={(_, node) => {
          onResourceClick(node?.data.treeNode);
        }}
      >
        <MiniMap />
        <Controls />
      </ReactFlow>
    );
  }
);

export default ConnectedGraph;
