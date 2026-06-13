import { observer } from "mobx-react-lite";
import {
  Condition,
  FluxResource,
  HelmRelease,
  Kustomization,
} from "../../../core/fluxTree/models/tree";
import Source from "../source/Source";
import ReconcileSuspendButtonGroup from "../play-pause/ReconcileSuspendButtonGroup";
import AppLogo from "../resource-icon/ResourceIcon";
import { Divider, Tooltip } from "@heroui/react";
import { useNavigate, Link } from "react-router-dom";
import { ROUTES } from "../../routes/routes.enum";
import TooltipedDate from "../tooltiped-date/TooltipedDate";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { formatBytes, formatCores } from "../../shared/format";
import StatusChip from "../status-chip/StatusChip";
import { Cpu, HardDrive, MemoryStick, Pause } from "lucide-react";
import {
  CONDITION_TYPE,
  ERROR_TYPES,
  SUCCESS_TYPES,
} from "../../../core/fluxTree/constants/conditions.const";
import { stringToEnum } from "../../../core/shared/enum.utils";

type AppProps = {
  node: FluxResource;
};

const conditionDotClass = (condition: Condition): string => {
  const conditionType = stringToEnum(CONDITION_TYPE, condition.type);
  if (conditionType && SUCCESS_TYPES.includes(conditionType)) {
    return condition.status ? "bg-success" : "bg-danger";
  }
  if (conditionType && ERROR_TYPES.includes(conditionType)) return "bg-danger";
  const failing = [
    "BuildFailed",
    "Failed",
    "Error",
    "Invalid",
    "HealthCheckFailed",
    "UpgradeFailed",
    "ReconciliationFailed",
  ];
  if (failing.includes(condition.reason)) return "bg-danger";
  const warning = ["ProgressingWithRetry", "Progressing", "DependencyNotReady"];
  if (warning.includes(condition.reason)) return "bg-warning";
  const success = [
    "InstallSucceeded",
    "UpgradeSucceeded",
    "ReconciliationSucceeded",
    "Succeeded",
    "ArtifactUpToDate",
  ];
  if (success.includes(condition.reason)) return "bg-success";
  return "bg-default-400";
};

const App: React.FC<AppProps> = observer(({ node }) => {
  const navigate = useNavigate();
  const fluxTreeStore = useInjection(FluxTreeStore);
  const metricsStore = useInjection(MetricsStore);

  const latest = metricsStore.latestUsage(node.uid);
  const lastCpu = latest?.cpu;
  const lastMem = latest?.memory;
  const showUsage =
    metricsStore.prometheusActive &&
    (lastCpu !== undefined || lastMem !== undefined);

  const storage = metricsStore.storageUsage.get(node.uid);
  const showStorage =
    metricsStore.prometheusActive && !!storage && storage.pvcCount > 0;

  const sourceRef =
    node instanceof Kustomization || node instanceof HelmRelease
      ? (node as Kustomization).metadata?.sourceRef
      : null;
  const repository = sourceRef
    ? fluxTreeStore.findRepositoryByRef(sourceRef)
    : null;

  const isKustomizationOrHelm =
    node instanceof Kustomization || node instanceof HelmRelease;
  const revisionLabel = node instanceof HelmRelease ? "Version" : "Revision";

  return (
    <div
      className="group flex flex-col rounded-xl bg-content1 border border-default-100 hover:bg-content2 transition-colors cursor-pointer overflow-hidden"
      onClick={() => navigate(`${ROUTES.RESOURCE}/${node.uid}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex-shrink-0">
            <AppLogo kind={node.kind} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate leading-tight">
              {node.name}
            </p>
            <p className="text-xs text-default-400 truncate">
              {node.kind} · {node.namespace}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {node.isSuspended && (
            <Tooltip content="Suspended" className="dark">
              <Pause className="w-3.5 h-3.5 text-default-400" />
            </Tooltip>
          )}
          <StatusChip resource={node} />
        </div>
      </div>

      {/* Condition indicators */}
      {node.conditions.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3">
          {node.conditions.slice(0, 4).map((c) => (
            <Tooltip key={c.type} content={c.message} className="dark">
              <div className="flex items-center gap-1.5 cursor-default">
                <div
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${conditionDotClass(c)}`}
                />
                <span className="text-xs text-default-400">{c.type}</span>
              </div>
            </Tooltip>
          ))}
          {node.conditions.length > 4 && (
            <span className="text-xs text-default-400">
              +{node.conditions.length - 4} more
            </span>
          )}
        </div>
      )}

      <Divider />

      {/* Info rows */}
      <div className="flex flex-col gap-1.5 px-4 py-3 text-xs">
        {sourceRef && repository && (
          <div className="flex justify-between items-center gap-2">
            <span className="text-default-400">Source</span>
            <Link
              to={`${ROUTES.RESOURCE}/${repository.uid}`}
              className="font-mono text-xs text-white hover:underline truncate max-w-[140px]"
              onClick={(e) => e.stopPropagation()}
            >
              {sourceRef.name}
            </Link>
          </div>
        )}
        {isKustomizationOrHelm && (
          <div
            className="flex justify-between items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-default-400">{revisionLabel}</span>
            <span className="font-mono truncate max-w-[140px]">
              <Source fluxResource={node} />
            </span>
          </div>
        )}
        <div className="flex justify-between items-center gap-2">
          <span className="text-default-400">Last sync</span>
          <span className="text-default-300">
            <TooltipedDate date={node.lastSyncAt} />
          </span>
        </div>
        {showUsage && (
          <div className="flex justify-between items-center gap-2">
            <span className="text-default-400">Usage</span>
            <span className="flex items-center gap-3 font-mono text-default-300">
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-default-400" />
                {lastCpu !== undefined ? formatCores(lastCpu) : "—"}
              </span>
              <span className="flex items-center gap-1">
                <MemoryStick className="w-3 h-3 text-default-400" />
                {lastMem !== undefined ? formatBytes(lastMem) : "—"}
              </span>
            </span>
          </div>
        )}
        {showStorage && (
          <div className="flex justify-between items-center gap-2">
            <span className="text-default-400">Storage</span>
            <span className="flex items-center gap-1 font-mono text-default-300">
              <HardDrive className="w-3 h-3 text-default-400" />
              {storage.measured > 0
                ? `${formatBytes(storage.used)} / ${formatBytes(storage.requested)}`
                : formatBytes(storage.requested)}
            </span>
          </div>
        )}
      </div>

      {/* Actions — stop propagation so click doesn't navigate */}
      <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        <ReconcileSuspendButtonGroup resource={node} compact />
      </div>
    </div>
  );
});

export default App;
