import { observer } from "mobx-react-lite";

import { Condition, KubeResource, ResourceStatus } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import { Skeleton, Tooltip } from "@heroui/react";
import TooltipedDate from "../tooltiped-date/TooltipedDate";
import { CheckCircle2, Clock, HelpCircle, RefreshCw, XCircle } from "lucide-react";
import { statusText } from "../../shared/helpers";
import {
  CONDITION_TYPE,
  ERROR_TYPES,
  SUCCESS_TYPES,
} from "../../../core/fluxTree/constants/conditions.const";
import { stringToEnum } from "../../../core/shared/enum.utils";

type ResourceStatusWidgetProps = {
  resource?: KubeResource;
  compact?: boolean;
};

const conditionDotClass = (condition: Condition): string => {
  const conditionType = stringToEnum(CONDITION_TYPE, condition.type);
  if (conditionType && SUCCESS_TYPES.includes(conditionType)) {
    return condition.status ? "bg-success" : "bg-danger";
  }
  if (conditionType && ERROR_TYPES.includes(conditionType)) return "bg-danger";

  const failing = [
    "BuildFailed", "Failed", "Error", "Invalid", "HealthCheckFailed",
    "UpgradeFailed", "ReconciliationFailed", "AuthenticationFailed",
    "RollbackFailed", "URLInvalid", "VerificationError",
  ];
  if (failing.includes(condition.reason)) return "bg-danger";

  const warning = [
    "ProgressingWithRetry", "Progressing", "DependencyNotReady",
    "ContainersNotReady", "MinimumReplicasUnavailable",
  ];
  if (warning.includes(condition.reason)) return "bg-warning";

  const success = [
    "InstallSucceeded", "UpgradeSucceeded", "ReconciliationSucceeded",
    "Succeeded", "ArtifactUpToDate", "ChartPullSucceeded", "NewReplicaSetAvailable",
  ];
  if (success.includes(condition.reason)) return "bg-success";

  return "bg-default-400";
};

type StatusStyle = { icon: React.ReactNode; bg: string; border: string; textClass: string };

const statusStyles: Partial<Record<ResourceStatus, StatusStyle>> = {
  [ResourceStatus.SUCCESS]: {
    icon: <CheckCircle2 className="w-4 h-4 text-success" />,
    bg: "bg-success/10",
    border: "border-success/20",
    textClass: "text-success",
  },
  [ResourceStatus.FAILED]: {
    icon: <XCircle className="w-4 h-4 text-danger" />,
    bg: "bg-danger/10",
    border: "border-danger/20",
    textClass: "text-danger",
  },
  [ResourceStatus.PENDING]: {
    icon: <RefreshCw className="w-4 h-4 text-warning animate-spin" />,
    bg: "bg-warning/10",
    border: "border-warning/20",
    textClass: "text-warning",
  },
  [ResourceStatus.WARNING]: {
    icon: <XCircle className="w-4 h-4 text-warning" />,
    bg: "bg-warning/10",
    border: "border-warning/20",
    textClass: "text-warning",
  },
};

const fallbackStyle: StatusStyle = {
  icon: <HelpCircle className="w-4 h-4 text-default-400" />,
  bg: "bg-default-100",
  border: "border-default-200",
  textClass: "text-default-400",
};

const ResourceStatusWidget: React.FC<ResourceStatusWidgetProps> = observer(
  ({ resource, compact }: ResourceStatusWidgetProps) => {
    if (!resource) {
      return (
        <Skeleton className="rounded-lg">
          <div className="h-24 rounded-lg bg-default-300" />
        </Skeleton>
      );
    }

    const style = statusStyles[resource.status] ?? fallbackStyle;

    return (
      <Widget span={2} title="Resource Status" compact={compact}>
        {/* Status banner */}
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${style.bg} ${style.border} mb-3`}
        >
          {style.icon}
          <span className={`text-sm font-semibold ${style.textClass}`}>
            {statusText(resource.status)}
          </span>
        </div>

        {/* Conditions */}
        {resource.conditions.length > 0 && (
          <div className="space-y-1 mb-3">
            {resource.conditions.map((c) => (
              <Tooltip key={c.type} content={c.message} className="dark">
                <div className="flex items-center justify-between gap-2 px-1 py-0.5 rounded cursor-default hover:bg-default-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${conditionDotClass(c)}`}
                    />
                    <span className="text-xs text-default-300 truncate">{c.type}</span>
                  </div>
                  <span className="text-xs text-default-500 truncate max-w-[150px] text-right">
                    {c.reason}
                  </span>
                </div>
              </Tooltip>
            ))}
          </div>
        )}

        {/* Created footer */}
        <div className="flex items-center justify-between pt-2 border-t border-default-100">
          <div className="flex items-center gap-1.5 text-default-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs">Created</span>
          </div>
          <span className="text-xs">
            <TooltipedDate date={resource.createdAt} />
          </span>
        </div>
      </Widget>
    );
  }
);

export default ResourceStatusWidget;
