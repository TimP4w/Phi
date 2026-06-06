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
  VisualizationNodeData,
} from "../../../core/fluxTree/models/tree";
import { LayoutTreeUseCase } from "../../../core/fluxTree/usecases/LayoutTree.usecase";
import { useInjection } from "inversify-react";
import { TYPES } from "../../../core/shared/types";
import Deployment from "../object/Deployment";
import Pod from "../object/Pod";
import Resource from "../object/Resource";
import { ResourceFilter } from "../../shared/resourceFilter";

type ConnectedGraphProps = {
  rootResource?: KubeResource;
  onResourceClick: (resource: KubeResource) => void;
  filter?: ResourceFilter;
  treeSize?: number;
};

const ConnectedGraph: React.FC<ConnectedGraphProps> = ({
  rootResource,
  onResourceClick,
  filter,
  treeSize,
}: ConnectedGraphProps) => {
  const layoutTreeUseCase = useInjection<LayoutTreeUseCase>(TYPES.LayoutTreeUseCase);
  const [rawNodes, setRawNodes] = useState<Node<VisualizationNodeData>[]>([]);
  const [rawEdges, setRawEdges] = useState<Edge[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<VisualizationNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const { fitView } = useReactFlow();
  const [shouldLayout, setShouldLayout] = useState(false);

  const nodeTypes = useMemo(
    () => ({ resource: Resource, deployment: Deployment, pod: Pod }),
    []
  );

  const previousRootUid = useRef<string | null>(null);
  const prevFilterRef = useRef<ResourceFilter | undefined>(undefined);
  const fitAfterLayoutRef = useRef(false);
  const isLayingOut = useRef(false);
  const layoutDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutThrottleStart = useRef<number | null>(null);
  const LAYOUT_MAX_WAIT = 300;

  // Reset tree when navigating to new node
  useLayoutEffect(() => {
    if (previousRootUid.current !== rootResource?.uid) {
      previousRootUid.current = rootResource?.uid ?? null;
      setRawNodes([]);
      setRawEdges([]);
      setNodes([]);
      setEdges([]);
      fitView();
      setShouldLayout(true);
      fitAfterLayoutRef.current = true; // fit once the first layout resolves
    }
  }, [rootResource?.uid, setNodes, setEdges, fitView]);

  // Trigger layout only when rootResource is set and shouldLayout is requested
  useEffect(() => {
    if (rootResource && shouldLayout && !isLayingOut.current) {
      isLayingOut.current = true;
      layoutTreeUseCase
        .execute({ nodeId: rootResource.uid || "" })
        .then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setRawNodes(layoutedNodes);
          setRawEdges(layoutedEdges);
        })
        .finally(() => {
          setShouldLayout(false);
          isLayingOut.current = false;
        });
    }
  }, [shouldLayout, rootResource, layoutTreeUseCase]);

  // Re-layout when the store's resource count changes (driven by incremental patches).
  // Throttled: fires at most once per LAYOUT_MAX_WAIT ms so a sustained burst of
  // patches doesn't delay layout indefinitely the way a pure debounce would.
  useEffect(() => {
    if (!rootResource || previousRootUid.current !== rootResource.uid) return;

    const now = Date.now();
    if (layoutThrottleStart.current === null) layoutThrottleStart.current = now;
    const elapsed = now - layoutThrottleStart.current;
    const delay = Math.max(0, LAYOUT_MAX_WAIT - elapsed);

    if (layoutDebounceRef.current) clearTimeout(layoutDebounceRef.current);
    layoutDebounceRef.current = setTimeout(() => {
      layoutThrottleStart.current = null;
      setShouldLayout(true);
    }, delay);

    return () => {
      if (layoutDebounceRef.current) clearTimeout(layoutDebounceRef.current);
    };
  }, [treeSize, rootResource]);

  // Apply filter: re-run ELK on visible subset so layout is tight (no gaps).
  // Bridge edges reconnect visible nodes through removed intermediates.
  useEffect(() => {
    if (rawNodes.length === 0) return;

    const filterChanged = filter !== prevFilterRef.current;
    prevFilterRef.current = filter;
    const shouldFitView = filterChanged || fitAfterLayoutRef.current;
    fitAfterLayoutRef.current = false;

    const hasActiveFilter = filter && (filter.statuses.length > 0 || filter.kinds.length > 0);

    if (!hasActiveFilter) {
      setNodes(rawNodes);
      setEdges(rawEdges);
      if (shouldFitView) setTimeout(() => fitView({ duration: 300 }), 50);
      return;
    }

    // Build visible set
    const visibleIds = new Set<string>();
    for (const n of rawNodes) {
      const res = n.data.treeNode;
      const statusMatch = filter!.statuses.length === 0 || filter!.statuses.includes(res.status);
      const kindMatch = filter!.kinds.length === 0 || filter!.kinds.includes(res.kind);
      if (statusMatch && kindMatch) visibleIds.add(n.id);
    }
    if (rootResource?.uid) visibleIds.add(rootResource.uid);

    const filteredNodes = rawNodes.filter((n) => visibleIds.has(n.id));

    // target → source mapping from original edges
    const parentOf = new Map<string, string>();
    for (const e of rawEdges) parentOf.set(e.target, e.source);

    // Walk up through invisible intermediates to find the nearest visible ancestor
    const nearestVisibleAncestor = (nodeId: string): string | null => {
      let cur = parentOf.get(nodeId);
      while (cur !== undefined) {
        if (visibleIds.has(cur)) return cur;
        cur = parentOf.get(cur);
      }
      return null;
    };

    // Build bridged edge set (one edge per visible node, to its nearest visible ancestor)
    const bridgedEdges: Edge[] = [];
    const connected = new Set<string>();
    for (const n of filteredNodes) {
      if (!parentOf.has(n.id)) continue; // root
      const directParent = parentOf.get(n.id)!;
      const ancestor = visibleIds.has(directParent)
        ? directParent
        : nearestVisibleAncestor(directParent);
      if (ancestor && !connected.has(n.id)) {
        bridgedEdges.push({
          id: `${ancestor}-${n.id}`,
          source: ancestor,
          target: n.id,
          type: "smoothstep",
          animated: true,
        });
        connected.add(n.id);
      }
    }

    let cancelled = false;
    layoutTreeUseCase.relayout(filteredNodes, bridgedEdges).then(({ nodes: ln, edges: le }) => {
      if (cancelled) return;
      setNodes(ln);
      setEdges(le);
      if (shouldFitView) setTimeout(() => fitView({ duration: 300 }), 50);
    });

    return () => { cancelled = true; };
  }, [rawNodes, rawEdges, filter, rootResource, setNodes, setEdges, fitView, layoutTreeUseCase]);

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
      onNodeClick={(_, node) => {
        onResourceClick(node?.data.treeNode);
      }}
    >
      <MiniMap />
      <Controls />
    </ReactFlow>
  );
};

export default ConnectedGraph;
