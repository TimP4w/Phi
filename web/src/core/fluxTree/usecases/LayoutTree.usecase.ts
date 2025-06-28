import { Edge, Node } from "@xyflow/react";
import { container } from "../../shared/inversify.config";
import UseCase from "../../shared/usecase";
import { FluxTreeStore } from "../stores/fluxTree.store";
import ELK, { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk.bundled.js";
import { RESOURCE_TYPE } from "../constants/resources.const";
import { VizualizationNodeData } from "../models/tree";


type Output = { nodes: Node<VizualizationNodeData>[], edges: Edge[]; };
type Input = { currentLayout: Node<VizualizationNodeData>[]; nodeId: string; };

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
        height: 80,
      })),
      edges: edges as unknown[] as ElkExtendedEdge[],
    };

    return this.elk
      .layout(graph)
      .then((layoutedGraph: ElkNode) => {
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
          edges: layoutedGraph.edges as unknown[] as Edge[] || [],
        };
      });
  };


  private buildNodesAndEdges(nodeId: string): Output {
    const nodes: Node<VizualizationNodeData>[] = [];
    let edges: Edge[] = [];
    const node = this.fluxTreeStore.tree.findNodeById(nodeId);


    const resourcesToSkip = [
      "ClusterRole",
      "ClusterRoleBinding",
      "CustomResourceDefinition"
    ]; // TODO: define if / what to skip. Maybe make it configurable


    this.fluxTreeStore.tree.traverse(node, (n, layer): boolean => {

      // Skip duplicates
      if (nodes.find((existingNode) => existingNode.id === n.uid)) {
        return false;
      }
      // Skip resources that are not interesting
      if (resourcesToSkip.includes(n.kind)) {
        return false;
      }


      let type; // TODO: This is a bit error prone, since we need to provide a string for the properties that we use in Tree.view.tsx (in nodeTypes)
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

      nodes.push({
        id: n.uid,
        data: {
          treeNode: n
        },
        type: type,
        position: {
          x: 0,
          y: 0,
        },
      });

      if ((n.kind === RESOURCE_TYPE.KUSTOMIZATION || n.kind === RESOURCE_TYPE.HELM_RELEASE) && layer > 0) {
        return true;
      }

      // Create edges
      for (const child of n.children) {
        if (resourcesToSkip.includes(child.kind)) {
          continue;
        }

        // Only maintain the furthermost edge if there are multiple parents
        if (edges.find((edge) => edge.target === child.uid)) {
          edges = edges.filter((edge) => edge.target !== child.uid);
        }
        edges.push({
          id: `${n.uid}-${child.uid}`,
          source: n.uid,
          target: child.uid,
          type: "smoothstep",
          animated: true,
        });
      }

      return false;
    });

    return { nodes, edges };
  }

}

export const layoutTreeUseCase = new LayoutTreeUseCase();
