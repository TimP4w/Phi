import { observer } from "mobx-react-lite";
import { KubeResource } from "../../../core/fluxTree/models/tree";
import AppLogo from "../resource-icon/ResourceIcon";
import { Link } from "@heroui/react";
import { ROUTES } from "../../routes/routes.enum";

import StatusChip from "../status-chip/StatusChip";

type ResourceCardProps = {
  resource?: KubeResource;
};

const ResourceCard: React.FC<ResourceCardProps> = observer(({ resource }) => {
  return (
    <Link
      href={`${ROUTES.RESOURCE}/${resource?.uid}`}
      className="w-full text-white border rounded-md border-default-200 hover:bg-default-100"
    >
      <div className="flex w-full flex-col p-2 border-default-200 gap-2">
        <div className="flex flex-row gap-3 items-center">
          <AppLogo kind={resource?.kind} />
          <span className="text-sm font-bold">{resource?.name}</span>
          <StatusChip resource={resource} />
          <div className="w-full flex justify-end"></div>
        </div>
        <span className="text-sm text-default-400">
          {resource?.kind} • {resource?.namespace}
        </span>
      </div>
    </Link>
  );
});

export default ResourceCard;
