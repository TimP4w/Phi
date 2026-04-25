import { VizualizationNodeData } from "../../../core/fluxTree/models/tree";
import Resource from "./Resource";
import { NodeProps, Node } from "@xyflow/react";

type ResourceProps = NodeProps<Node<VizualizationNodeData>>;

function Pod(props: ResourceProps) {
  return <Resource {...props} />;
}

export default Pod;
