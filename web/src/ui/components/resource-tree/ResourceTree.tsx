import { observer } from "mobx-react-lite";
import { KubeResource, ResourceStatus } from "../../../core/fluxTree/models/tree";
import { Skeleton, Tooltip } from "@heroui/react";
import { useState } from "react";
import AppLogo from "../resource-icon/ResourceIcon";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../routes/routes.enum";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { ChevronRight, ExternalLink } from "lucide-react";
import StatusChip from "../status-chip/StatusChip";
import { ResourceFilter, subtreeHasMatch } from "../../shared/resourceFilter";

const dotClass = (status: ResourceStatus): string => {
  switch (status) {
    case ResourceStatus.SUCCESS: return "bg-success";
    case ResourceStatus.FAILED: return "bg-danger";
    case ResourceStatus.PENDING:
    case ResourceStatus.WARNING: return "bg-warning";
    default: return "bg-default-400";
  }
};

function nodeMatchesFilter(node: KubeResource, filter: ResourceFilter): boolean {
  const statusMatch = filter.statuses.length === 0 || filter.statuses.includes(node.status);
  const kindMatch = filter.kinds.length === 0 || filter.kinds.includes(node.kind);
  return statusMatch && kindMatch;
}

type ResourceTreeProps = {
  resource?: KubeResource;
  level: number;
  onResourceClick: (node: KubeResource) => void;
  filter?: ResourceFilter;
};

const ResourceTree: React.FC<ResourceTreeProps> = observer(
  ({ resource, level = 0, onResourceClick, filter }) => {
    const isCollapsedByDefault =
      level > 0 &&
      !!resource &&
      (resource.kind === RESOURCE_TYPE.KUSTOMIZATION ||
        resource.kind === RESOURCE_TYPE.HELM_RELEASE);
    const [isExpanded, setIsExpanded] = useState(!isCollapsedByDefault);
    const navigate = useNavigate();

    if (!resource) {
      return (
        <div className="flex flex-col gap-1.5 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              className="rounded-lg h-10"
              style={{ marginLeft: `${i * 24}px` }}
            />
          ))}
        </div>
      );
    }

    const hasActiveFilter = filter && (filter.statuses.length > 0 || filter.kinds.length > 0);
    if (hasActiveFilter && !subtreeHasMatch(resource, filter!)) {
      return null;
    }

    const hasChildren = resource.children.length > 0;
    const canExpand = hasChildren;
    const shouldShowChildren = isExpanded && canExpand;

    const failureMessage =
      resource.status === ResourceStatus.FAILED ||
      resource.status === ResourceStatus.WARNING
        ? resource.conditions.find((c) => !c.status)?.message
        : undefined;

    const dimmed = hasActiveFilter && !nodeMatchesFilter(resource, filter!);

    return (
      <div>
        {/* Node row */}
        <div
          className={`group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-content2 transition-colors cursor-pointer select-none ${
            dimmed ? "opacity-40" : ""
          }`}
          onClick={() => onResourceClick(resource)}
        >
          {/* Expand / collapse */}
          {canExpand ? (
            <button
              className="flex-shrink-0 text-default-400 hover:text-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((v) => !v);
              }}
            >
              <ChevronRight
                className={`w-4 h-4 transition-transform duration-150 ${
                  isExpanded ? "rotate-90" : ""
                }`}
              />
            </button>
          ) : (
            <div className="w-4 h-4 flex-shrink-0" />
          )}

          {/* Status dot */}
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass(resource.status)}`}
          />

          {/* Kind icon */}
          <div className="flex-shrink-0">
            <AppLogo kind={resource.kind} />
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold truncate">{resource.name}</span>
              <span className="text-xs text-default-500 flex-shrink-0">
                {resource.kind}
              </span>
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

          {/* Status */}
          <div className="flex-shrink-0">
            <StatusChip resource={resource} />
          </div>

          {/* Navigate — visible on row hover */}
          <Tooltip content="Open resource" className="dark">
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-default-400 hover:text-foreground p-1 rounded-md hover:bg-default-100"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`${ROUTES.RESOURCE}/${resource.uid}`);
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>

        {/* Children */}
        {shouldShowChildren && (
          <div className="ml-5 border-l border-default-100 pl-2.5">
            {resource.children.map((child) => (
              <ResourceTree
                key={child.uid}
                resource={child}
                level={level + 1}
                onResourceClick={onResourceClick}
                filter={filter}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

export default ResourceTree;
