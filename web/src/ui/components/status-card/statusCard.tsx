import { observer } from "mobx-react-lite";
import "./statusCard.scss";
import {
  DeploymentNode,
  ResourceStatus,
  TreeNode,
} from "../../../core/fluxTree/models/tree";
import { useMemo } from "react";
import StatusCircle from "../status-circle/StatusCircle";

type StatusCardProps = {
  node: TreeNode;
  onClick?: (node: TreeNode) => void;
};

const StatusCard: React.FC<StatusCardProps> = observer(
  ({ node, onClick }: StatusCardProps) => {
    const status = useMemo(() => {
      if (node instanceof DeploymentNode) {
        return node.status;
      }
      return ResourceStatus.FAILED;
    }, [node]);

    return (
      <div
        className="status-card"
        onClick={() => {
          if (onClick) {
            onClick(node);
          }
        }}
      >
        <span className="status-card__label">{node.name}</span>
        <StatusCircle status={status} />
      </div>
    );
  }
);

export default StatusCard;
