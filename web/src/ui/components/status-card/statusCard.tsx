import { observer } from "mobx-react-lite";
import "./statusCard.scss";
import { ResourceStatus, TreeNode } from "../../../core/fluxTree/models/tree";
import { useMemo } from "react";
import StatusCircle from "../status-circle/StatusCircle";

type StatusCardProps = {
  node: TreeNode;
  onClick?: (node: TreeNode) => void;
};

const StatusCard: React.FC<StatusCardProps> = observer(
  ({ node, onClick }: StatusCardProps) => {
    const status = useMemo(() => {
      if (node.children.length === 0) {
        return ResourceStatus.FAILED;
      }
      if (node.children[0].children.length === 0) {
        return ResourceStatus.FAILED;
      }

      return node.children[0].children[0].status;
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
