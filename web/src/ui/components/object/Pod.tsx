import { useMemo } from "react";
import {
  PodNode,
  VizualizationNodeData,
} from "../../../core/fluxTree/models/tree";
import Resource from "./Resource";
import "./resource.scss";
import { NodeProps, Node } from "@xyflow/react";
import Tag from "../tag/Tag";

type ResourceProps = NodeProps<Node<VizualizationNodeData>>;

function Pod(props: ResourceProps) {
  const pod = useMemo(() => {
    return props.data.treeNode as PodNode;
  }, [props.data]);

  return (
    <div>
      <div className="resource__extra-tag">
        <Tag>{`${pod.metadata?.phase}`}</Tag>
      </div>
      <Resource {...props}></Resource>
    </div>
  );
}

export default Pod;
