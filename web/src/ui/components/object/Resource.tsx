import {
  ResourceStatus,
  VizualizationNodeData,
} from "../../../core/fluxTree/models/tree";
import FluxLogo from "../../assets/flux-logo";
import { Spacer } from "../shared/commont.components";
import StatusCircle from "../status-circle/StatusCircle";
import Tag from "../tag/Tag";
import Tooltip from "../tooltip/Tooltip";
import "./resource.scss";
import { Handle, NodeProps, Position, Node } from "@xyflow/react";

type ResourceProps = NodeProps<Node<VizualizationNodeData>>;

function Resource({ data }: ResourceProps) {
  const treeNode = data.treeNode;

  return (
    <div className="resource">
      <div className="resource__kind-tag">
        <Tag>{treeNode.kind}</Tag>
      </div>
      <Handle type="target" position={Position.Left} />
      <div className="resource__content">
        <div>
          <div className="resource__label-container">
            <span className="resource__name">{treeNode.name}</span>
            <span className="resource__namespace">{treeNode.namespace}</span>
          </div>
        </div>
        <div className="resource__status-container">
          {treeNode.status !== ResourceStatus.UNKNOWN && (
            <>
              <StatusCircle status={treeNode.status} />
            </>
          )}
          {treeNode.isFluxManaged && (
            <>
              <div />
              <div className="resource__flux-managed-tag">
                <Tooltip message="Managed By Flux" />
                <FluxLogo width={50} height={30} />
              </div>
            </>
          )}
        </div>
      </div>

      {treeNode.children.length > 0 ? (
        <Handle type="source" position={Position.Right} />
      ) : null}
    </div>
  );
}

export default Resource;
