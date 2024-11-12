import { observer } from "mobx-react-lite";
import "./statusCircle.scss";
import { ResourceStatus } from "../../../core/fluxTree/models/tree";
import { COLORS } from "../../shared/colors";
import { useMemo } from "react";

type StatusCircleProps = {
  status: ResourceStatus;
};

const StatusCircle: React.FC<StatusCircleProps> = observer(
  ({ status }: StatusCircleProps) => {
    const statusColor = useMemo(() => {
      switch (status) {
        case ResourceStatus.SUCCESS:
          return COLORS.SUCCESS;
        case ResourceStatus.PENDING:
          return COLORS.WARNING;
        case ResourceStatus.FAILED:
          return COLORS.ERROR;
        default:
          return COLORS.SECONDARY;
      }
    }, [status]);

    return (
      <div
        className="status-circle"
        style={{
          backgroundColor: statusColor,
        }}
      ></div>
    );
  }
);

export default StatusCircle;
