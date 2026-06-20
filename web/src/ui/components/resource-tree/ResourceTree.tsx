import { observer } from "mobx-react-lite";
import { KubeResource, ResourceStatus } from "../../../core/fluxTree/models/tree";
import { Skeleton, Tooltip } from "@heroui/react";
import { useState } from "react";
import AppLogo from "../resource-icon/ResourceIcon";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../routes/routes.enum";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { ChevronRight, ExternalLink, ShieldAlert } from "lucide-react";
import StatusChip from "../status-chip/StatusChip";
import {
  ResourceFilter,
  collectMatchingSubtrees,
  nodeMatchesFilter,
} from "../../shared/resourceFilter";
import { statusDotClass } from "../../shared/helpers";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import {
  totalCves,
  totalOther,
  summaryWorstSeverity,
  severityColor,
} from "../../../core/trivy/trivy";

const severityTextClass: Record<string, string> = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  default: "text-muted",
};

type ResourceTreeProps = {
  resource?: KubeResource;
  level: number;
  onResourceClick: (node: KubeResource) => void;
  filter?: ResourceFilter;
  // UIDs whose subtree contains a filter match, precomputed once by the root so
  // pruning is an O(1) membership test per node instead of a per-node subtree walk.
  matchSet?: Set<string>;
};

const ResourceTree: React.FC<ResourceTreeProps> = observer(
  ({ resource, level = 0, onResourceClick, filter, matchSet }) => {
    const isCollapsedByDefault =
      level > 0 &&
      !!resource &&
      (resource.kind === RESOURCE_TYPE.KUSTOMIZATION ||
        resource.kind === RESOURCE_TYPE.HELM_RELEASE);
    const [isExpanded, setIsExpanded] = useState(!isCollapsedByDefault);
    const navigate = useNavigate();
    const fluxTreeStore = useInjection(FluxTreeStore);

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
    // The root computes the match set once (O(n)); descendants inherit it. Recomputed
    // each render rather than memoized so it stays correct as the observed tree mutates.
    const activeMatchSet =
      hasActiveFilter && level === 0
        ? collectMatchingSubtrees(resource, filter!)
        : matchSet;

    if (hasActiveFilter && activeMatchSet && !activeMatchSet.has(resource.uid)) {
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

    // Trivy findings scoped to this exact node (the workload the report targets).
    const findings = fluxTreeStore.trivyIndex.get(resource.uid);
    const worst = findings ? summaryWorstSeverity(findings) : null;
    const findingsColor = severityColor(worst);

    return (
      <div>
        {/* Node row */}
        <div
          className={`group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-secondary transition-colors cursor-pointer select-none ${
            dimmed ? "opacity-40" : ""
          }`}
          onClick={() => onResourceClick(resource)}
        >
          {/* Expand / collapse */}
          {canExpand ? (
            <button
              className="flex-shrink-0 text-muted hover:text-foreground transition-colors"
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
            className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotClass(resource.status)}`}
          />

          {/* Kind icon */}
          <div className="flex-shrink-0">
            <AppLogo groupKind={resource.groupKind} />
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold truncate">{resource.name}</span>
              <span className="text-xs text-muted flex-shrink-0">
                {resource.kind}
              </span>
              {resource.namespace && (
                <span className="text-xs text-foreground font-mono flex-shrink-0">
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

          {/* Trivy findings */}
          {findings && (
            <Tooltip>
              <Tooltip.Trigger>
                <span
                  className={`flex items-center gap-0.5 flex-shrink-0 text-xs ${severityTextClass[findingsColor]}`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {totalCves(findings) > 0 && totalCves(findings)}
                </span>
              </Tooltip.Trigger>
              <Tooltip.Content>
                {`${totalCves(findings)} CVEs` +
                  (totalOther(findings) > 0
                    ? `, ${totalOther(findings)} other findings`
                    : "")}
              </Tooltip.Content>
            </Tooltip>
          )}

          {/* Status */}
          <div className="flex-shrink-0">
            <StatusChip resource={resource} />
          </div>

          {/* Navigate — visible on row hover */}
          <Tooltip>
            <Tooltip.Trigger>
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-muted hover:text-foreground p-1 rounded-md hover:bg-surface-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`${ROUTES.RESOURCE}/${resource.uid}`);
                }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content>Open resource</Tooltip.Content>
          </Tooltip>
        </div>

        {/* Children */}
        {shouldShowChildren && (
          <div className="ml-5 border-l border-border pl-2.5">
            {resource.children.map((child) => (
              <ResourceTree
                key={child.uid}
                resource={child}
                level={level + 1}
                onResourceClick={onResourceClick}
                filter={filter}
                matchSet={activeMatchSet}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

export default ResourceTree;
