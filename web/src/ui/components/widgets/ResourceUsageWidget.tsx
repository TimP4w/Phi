import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import WidgetCard from "./Widget";
import Sparkline from "../metrics/Sparkline";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { formatBytes, formatCores, usageColor, usagePercent } from "../../shared/format";

type ResourceUsageWidgetProps = {
  uid: string;
};

// ResourceUsageWidget shows the aggregate CPU/memory usage of a resource
// (summed across all its pods) for the tree/graph view sidebar.
const ResourceUsageWidget: React.FC<ResourceUsageWidgetProps> = observer(
  ({ uid }) => {
    const metricsStore = useInjection(MetricsStore);
    if (!metricsStore.prometheusActive) return null;
    const usage = metricsStore.currentUsage.get(uid);
    const storage = metricsStore.storageUsage.get(uid);
    const hasCompute = !!usage && (usage.cpu.length > 0 || usage.memory.length > 0);
    const hasStorage = !!storage && storage.pvcCount > 0;
    if (!hasCompute && !hasStorage) return null;

    const latest = hasCompute ? metricsStore.latestUsage(uid)! : undefined;

    const row = (
      label: string,
      value: string,
      limit: string | null,
      values: number[],
      stroke: string,
    ) => (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-default-400">{label}</span>
          <span className="font-mono text-default-300">
            {value}
            {limit ? ` / ${limit}` : ""}
          </span>
        </div>
        <Sparkline values={values} width={260} height={32} className={stroke} />
      </div>
    );

    const storageRow = () => {
      if (!hasStorage) return null;
      const { requested, used, pvcCount, measured } = storage;
      const hasUsed = measured > 0;
      const pct = hasUsed && requested > 0 ? usagePercent(used, requested) : 0;
      return (
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center justify-between gap-2 text-xs min-w-0">
            <span className="text-default-400 truncate">
              Storage
              <span className="text-default-300"> · {pvcCount} PVC{pvcCount === 1 ? "" : "s"}</span>
            </span>
            <span className="font-mono text-default-300 shrink-0">
              {hasUsed ? `${formatBytes(used)} / ${formatBytes(requested)} (${pct.toFixed(0)}%)` : formatBytes(requested)}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-default-100 overflow-hidden">
            <div
              className={`h-full rounded-full bg-${usageColor(pct)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {hasUsed && measured < pvcCount && (
            <span className="text-[10px] text-default-300 text-right">
              measured {measured}/{pvcCount}
            </span>
          )}
        </div>
      );
    };

    return (
      <WidgetCard title="Resource Usage" subtitle="aggregate across pods">
        <div className="flex flex-col gap-3 min-w-0">
          {hasCompute && row(
            "CPU",
            latest!.cpu !== undefined ? formatCores(latest!.cpu) : "—",
            latest!.cpuLimit != null ? formatCores(latest!.cpuLimit) : null,
            usage!.cpu.map((s) => s.v),
            "stroke-primary",
          )}
          {hasCompute && row(
            "Memory",
            latest!.memory !== undefined ? formatBytes(latest!.memory) : "—",
            latest!.memoryLimit != null ? formatBytes(latest!.memoryLimit) : null,
            usage!.memory.map((s) => s.v),
            "stroke-success",
          )}
          {storageRow()}
        </div>
      </WidgetCard>
    );
  },
);

export default ResourceUsageWidget;
