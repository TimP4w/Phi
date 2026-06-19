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
import { useEffect, useMemo, useRef, useState } from "react";
import { useInjection } from "inversify-react";
import { KubeResource } from "../../../core/fluxTree/models/tree";
import {
  NetworkNodeData,
  NetworkTopologyUseCase,
} from "../../../core/network/usecases/NetworkTopology.usecase";
import { TYPES } from "../../../core/shared/types";
import NetworkResourceNode from "./NetworkResourceNode";
import InternetNode from "./InternetNode";
import ExternalIpNode from "./ExternalIpNode";
import EntrypointNode from "./EntrypointNode";
import MiddlewareWallNode from "./MiddlewareWallNode";
import PolicyPeerNode from "./PolicyPeerNode";

type NetworkGraphProps = {
  rootResource?: KubeResource;
  onResourceClick: (resource: KubeResource) => void;
  treeSize?: number;
};

// forwardClosure returns the clicked node plus everything reachable downstream, and the edges along those paths.
export function forwardClosure(
  startId: string,
  edges: Edge[],
): { nodes: Set<string>; edges: Set<string> } {
  const adjacency = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    adjacency.get(e.source)!.push(e);
  }
  const nodeSet = new Set<string>([startId]);
  const edgeSet = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of adjacency.get(current) ?? []) {
      edgeSet.add(edge.id);
      if (!nodeSet.has(edge.target)) {
        nodeSet.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return { nodes: nodeSet, edges: edgeSet };
}

const NetworkGraph: React.FC<NetworkGraphProps> = ({
  rootResource,
  onResourceClick,
  treeSize,
}) => {
  const networkUseCase = useInjection<NetworkTopologyUseCase>(
    TYPES.NetworkTopologyUseCase,
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NetworkNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { fitView } = useReactFlow();
  const fitAfterLayout = useRef(false);

  const nodeTypes = useMemo(
    () => ({
      resource: NetworkResourceNode,
      deployment: NetworkResourceNode,
      pod: NetworkResourceNode,
      internet: InternetNode,
      externalIp: ExternalIpNode,
      entrypoint: EntrypointNode,
      middlewareWall: MiddlewareWallNode,
      policyPeer: PolicyPeerNode,
    }),
    [],
  );

  // Re-resolve when the focus changes; fit the viewport once the layout lands.
  useEffect(() => {
    fitAfterLayout.current = true;
    setSelectedId(null);
  }, [rootResource?.uid]);

  useEffect(() => {
    if (!rootResource?.uid) {
      setNodes([]);
      setEdges([]);
      return;
    }
    let cancelled = false;
    networkUseCase
      .execute({ nodeId: rootResource.uid })
      .then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
        if (cancelled) return;
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        if (fitAfterLayout.current) {
          fitAfterLayout.current = false;
          setTimeout(() => fitView({ duration: 300 }), 50);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rootResource?.uid, treeSize, networkUseCase, setNodes, setEdges, fitView]);

  // Forward path highlight: dim everything not downstream of the selected node.
  const highlight = useMemo(
    () => (selectedId ? forwardClosure(selectedId, edges) : null),
    [selectedId, edges],
  );

  const displayNodes = useMemo(() => {
    if (!highlight) return nodes;
    return nodes.map((n) => ({
      ...n,
      style: { ...n.style, opacity: highlight.nodes.has(n.id) ? 1 : 0.2 },
    }));
  }, [nodes, highlight]);

  const displayEdges = useMemo(() => {
    if (!highlight) return edges;
    return edges.map((e) =>
      highlight.edges.has(e.id)
        ? { ...e, animated: true, style: { ...e.style, opacity: 1, strokeWidth: 2.5 } }
        : { ...e, animated: false, style: { ...e.style, opacity: 0.08 } },
    );
  }, [edges, highlight]);

  return (
    <ReactFlow
      nodes={displayNodes}
      edges={displayEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
      nodeTypes={nodeTypes}
      minZoom={0.2}
      maxZoom={4}
      nodesDraggable={false}
      colorMode={"dark"}
      onPaneClick={() => setSelectedId(null)}
      onNodeClick={(_, node) => {
        setSelectedId((current) => (current === node.id ? null : node.id));
      }}
      onNodeContextMenu={(e, node) => {
        e.preventDefault();
        const treeNode = (node?.data as { treeNode?: KubeResource })?.treeNode;
        if (treeNode) onResourceClick(treeNode);
      }}
    >
      <MiniMap />
      <Controls />
    </ReactFlow>
  );
};

export default NetworkGraph;
