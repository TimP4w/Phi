import { observer } from "mobx-react-lite";
import { KubeResource } from "../../../core/fluxTree/models/tree";
import AppLogo from "../resource-icon/ResourceIcon";
import { Link } from "react-router-dom";
import { ROUTES } from "../../routes/routes.enum";

import StatusChip from "../status-chip/StatusChip";

type ResourceCardProps = {
  resource?: KubeResource;
};

const ResourceCard: React.FC<ResourceCardProps> = observer(({ resource }) => {
  return (
    <Link
      to={`${ROUTES.RESOURCE}/${resource?.uid}`}
      className="w-full text-white border rounded-md border-border hover:bg-surface-secondary"
    >
      <div className="flex w-full flex-col p-2 border-border gap-2">
        <div className="flex flex-row gap-3 items-center">
          <AppLogo groupKind={resource?.groupKind} />
          <span className="text-sm font-bold">{resource?.name}</span>
          <StatusChip resource={resource} />
          <div className="w-full flex justify-end"></div>
        </div>
        <span className="text-sm text-muted">
          {resource?.kind} • {resource?.namespace}
        </span>
      </div>
    </Link>
  );
});

export default ResourceCard;
