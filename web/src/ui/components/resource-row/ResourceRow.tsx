import { KubeResource, ResourceStatus } from "../../../core/fluxTree/models/tree";
import AppLogo from "../resource-icon/ResourceIcon";
import StatusChip from "../status-chip/StatusChip";
import { Link } from "react-router-dom";
import { ROUTES } from "../../routes/routes.enum";

const resourceDotClass = (status: ResourceStatus): string => {
  switch (status) {
    case ResourceStatus.SUCCESS: return "bg-success";
    case ResourceStatus.FAILED: return "bg-danger";
    case ResourceStatus.PENDING: return "bg-primary";
    case ResourceStatus.WARNING: return "bg-warning";
    case ResourceStatus.SUSPENDED: return "bg-default-400";
    default: return "bg-default-400";
  }
};

type ResourceRowProps = {
  resource: KubeResource;
  className?: string;
};

const ResourceRow: React.FC<ResourceRowProps> = ({ resource, className = "" }) => {
  const failureMessage =
    resource.status === ResourceStatus.FAILED || resource.status === ResourceStatus.WARNING
      ? resource.conditions.find((c) => !c.status)?.message
      : undefined;

  return (
    <Link
      to={`${ROUTES.RESOURCE}/${resource.uid}`}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-content2 transition-colors text-foreground ${className}`}
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${resourceDotClass(resource.status)}`} />
      <div className="flex-shrink-0">
        <AppLogo kind={resource.kind} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{resource.name}</span>
          <span className="text-xs text-default-500 flex-shrink-0">{resource.kind}</span>
          {resource.namespace && (
            <span className="text-xs text-default-600 font-mono flex-shrink-0">
              {resource.namespace}
            </span>
          )}
        </div>
        {failureMessage && (
          <p className="text-xs text-danger truncate leading-tight mt-0.5">
            {failureMessage}
          </p>
        )}
      </div>
      <div className="flex-shrink-0">
        <StatusChip resource={resource} />
      </div>
    </Link>
  );
};

export default ResourceRow;
