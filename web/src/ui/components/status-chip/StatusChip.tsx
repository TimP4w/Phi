import { observer } from "mobx-react-lite";
import { KubeResource } from "../../../core/fluxTree/models/tree";
import { colorByStatus, statusText } from "../../shared/helpers";
import { Chip } from "@heroui/react";

type StatusChipProps = {
  resource?: KubeResource;
};

const StatusChip: React.FC<StatusChipProps> = observer(
  ({ resource }: StatusChipProps) => {
    if (!resource) {
      return (
        <Chip size="sm" variant="tertiary" color={"accent"}>
          Unknown
        </Chip>
      );
    }
    return (
      <Chip size="sm" variant="tertiary" color={colorByStatus(resource?.status)}>
        {statusText(resource?.status)}
      </Chip>
    );
  }
);

export default StatusChip;
