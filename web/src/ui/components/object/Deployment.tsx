import { useMemo } from "react";
import {
  Deployment as DeploymentResource,
  VizualizationNodeData,
} from "../../../core/fluxTree/models/tree";
import Resource from "./Resource";
import "./resource.scss";
import { NodeProps, Node } from "@xyflow/react";
import { Chip } from "@heroui/react";

type ResourceProps = NodeProps<Node<VizualizationNodeData>>;

function Deployment(props: ResourceProps) {
  const deployment = useMemo(() => {
    return props.data.treeNode as DeploymentResource;
  }, [props.data]);

  return (
    <div>
      <div className="resource__extra-tag">
        <Chip className="absolute z-10 -top-9 -right-16">{`${
          deployment.metadata?.readyReplicas || 0
        }/${deployment.metadata?.replicas || 0}`}</Chip>
      </div>
      <Resource {...props}></Resource>
    </div>
  );
}

export default Deployment;
