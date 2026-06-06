import { VisualizationNodeData } from "../../../core/fluxTree/models/tree";
import Resource from "./Resource";
import { NodeProps, Node } from "@xyflow/react";

type ResourceProps = NodeProps<Node<VisualizationNodeData>>;

function Deployment(props: ResourceProps) {
  return <Resource {...props} />;
}

export default Deployment;
