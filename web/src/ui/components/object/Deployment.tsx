import { useMemo } from "react";
import {
  DeploymentNode,
  VizualizationNodeData,
} from "../../../core/fluxTree/models/tree";
import Resource from "./Resource";
import "./resource.scss";
import { NodeProps, Node } from "@xyflow/react";
import Tag from "../tag/Tag";

type ResourceProps = NodeProps<Node<VizualizationNodeData>>;

function Deployment(props: ResourceProps) {
  const deployment = useMemo(() => {
    return props.data.treeNode as DeploymentNode;
  }, [props.data]);

  return (
    <div>
      <div className="resource__extra-tag">
        <Tag>{`${deployment.metadata?.readyReplicas}/${deployment.metadata?.replicas} `}</Tag>
      </div>
      <Resource {...props}></Resource>
    </div>
  );
}

export default Deployment;
