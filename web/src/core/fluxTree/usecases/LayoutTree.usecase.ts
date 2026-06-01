import { Edge, Node } from "@xyflow/react";
import { container } from "../../shared/inversify.config";
import UseCase from "../../shared/usecase";
import { FluxTreeStore } from "../stores/fluxTree.store";
import ELK, { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk.bundled.js";
import { RESOURCE_TYPE } from "../constants/resources.const";
import { VizualizationNodeData } from "../models/tree";

type Output = { nodes: Node<VizualizationNodeData>[]; edges: Edge[] };
type Input = { currentLayout: Node<VizualizationNodeData>[]; nodeId: string };

export class LayoutTreeUseCase extends UseCase<Input, Promise<Output>> {
  private fluxTreeStore = container.get<FluxTreeStore>(FluxTreeStore);
  private elk = new ELK();
  private elkOptions = {
    "elk.algorithm": "mrtree",
    "elk.layered.spacing.nodeNodeBetweenLayers": "15",
    "elk.spacing.nodeNode": "180",
    "elk.direction": "RIGHT", // TODO: make this configurable
    "elk.searchOrder": "DFS",
    "elk.topDownLayout": "true",
  };

  public execute(input: Input): Promise<Output> {
    const { nodes, edges } = this.buildNodesAndEdges(input.nodeId);

    const isHorizontal = this.elkOptions?.["elk.direction"] === "RIGHT";

    const graph: ElkNode = {
      id: "root",
      layoutOptions: this.elkOptions,
      children: nodes.map((node) => ({
        ...node,
        targetPosition: isHorizontal ? "left" : "top", // Adjust the target and source handle positions based on the layout direction.
        sourcePosition: isHorizontal ? "right" : "bottom",
        width: 240, // Hardcode a width and height for elk to use when layouting.
        height: 96,
      })),
      edges: edges as unknown[] as ElkExtendedEdge[],
    };

    return this.elk.layout(graph).then((layoutedGraph: ElkNode) => {
      if (!layoutedGraph.children) {
        return { nodes: [], edges: [] };
      }
      return {
        nodes: layoutedGraph.children.map((node) => ({
          ...node,
          position: {
            x: node.x!,
            y: node.y!,
          },
        })) as Node<VizualizationNodeData>[],
        edges: (layoutedGraph.edges as unknown[] as Edge[]) || [],
      };
    });
  }

  public relayout(
    nodes: Node<VizualizationNodeData>[],
    edges: Edge[],
  ): Promise<Output> {
    const isHorizontal = this.elkOptions["elk.direction"] === "RIGHT";

    const graph: ElkNode = {
      id: "root",
      layoutOptions: this.elkOptions,
      children: nodes.map((node) => ({
        ...node,
        targetPosition: isHorizontal ? "left" : "top",
        sourcePosition: isHorizontal ? "right" : "bottom",
        width: 240,
        height: 96,
      })),
      edges: edges as unknown[] as ElkExtendedEdge[],
    };

    return this.elk.layout(graph).then((layoutedGraph) => {
      if (!layoutedGraph.children) return { nodes: [], edges: [] };
      return {
        nodes: layoutedGraph.children.map((node) => ({
          ...node,
          position: { x: node.x!, y: node.y! },
        })) as Node<VizualizationNodeData>[],
        edges: (layoutedGraph.edges as unknown[] as Edge[]) || [],
      };
    });
  }

  private buildNodesAndEdges(nodeId: string): Output {
    const nodes: Node<VizualizationNodeData>[] = [];
    const edges: Edge[] = [];
    const visitedIds = new Set<string>();
    const edgeTargets = new Set<string>();
    const node =
      this.fluxTreeStore.resources.get(nodeId) ?? this.fluxTreeStore.tree.root;

    const resourcesToSkip = new Set([
      // "ClusterRole",
      // "ClusterRoleBinding",
      // "CustomResourceDefinition"
    ]);

    this.fluxTreeStore.tree.traverse(node, (n): boolean => {
      if (visitedIds.has(n.uid)) return true;
      if (resourcesToSkip.has(n.kind)) return false;

      let type;
      switch (n.kind) {
        case RESOURCE_TYPE.DEPLOYMENT:
          type = "deployment";
          break;
        case RESOURCE_TYPE.POD:
          type = "pod";
          break;
        default:
          type = "resource";
          break;
      }

      visitedIds.add(n.uid);
      nodes.push({
        id: n.uid,
        data: { treeNode: n },
        type: type,
        position: { x: 0, y: 0 },
      });

      for (const child of n.children) {
        if (resourcesToSkip.has(child.kind)) continue;

        if (edgeTargets.has(child.uid)) {
          // Replace previous edge to this target with the furthermost one
          const idx = edges.findIndex((e) => e.target === child.uid);
          if (idx !== -1) edges.splice(idx, 1);
        }
        edges.push({
          id: `${n.uid}-${child.uid}`,
          source: n.uid,
          target: child.uid,
          type: "smoothstep",
          animated: true,
        });
        edgeTargets.add(child.uid);
      }

      return false;
    });

    return { nodes, edges };
  }
}

export const layoutTreeUseCase = new LayoutTreeUseCase();
