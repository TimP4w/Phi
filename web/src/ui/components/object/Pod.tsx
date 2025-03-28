import { useMemo } from "react";
import {
  PodNode,
  VizualizationNodeData,
} from "../../../core/fluxTree/models/tree";
import Resource from "./Resource";
import "./resource.scss";
import { NodeProps, Node } from "@xyflow/react";
import { Chip } from "@heroui/react";

type ResourceProps = NodeProps<Node<VizualizationNodeData>>;

function Pod(props: ResourceProps) {
  const pod = useMemo(() => {
    return props.data.treeNode as PodNode;
  }, [props.data]);

  return (
    <div>
      <div className="resource__extra-tag">
        <Chip className="absolute z-10 -top-9 -right-16">{`${pod.metadata?.phase}`}</Chip>
      </div>
      <Resource {...props}></Resource>
    </div>
  );
}

export default Pod;
