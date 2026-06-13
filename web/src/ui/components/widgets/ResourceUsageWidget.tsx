import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import WidgetCard from "./Widget";
import Sparkline from "../metrics/Sparkline";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { formatBytes, formatCores } from "../../shared/format";

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
    if (!usage || (usage.cpu.length === 0 && usage.memory.length === 0)) return null;

    const { cpu: lastCpu, memory: lastMem, cpuLimit, memoryLimit: memLimit } =
      metricsStore.latestUsage(uid)!;

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

    return (
      <WidgetCard title="Resource Usage" subtitle="aggregate across pods">
        <div className="flex flex-col gap-3">
          {row(
            "CPU",
            lastCpu !== undefined ? formatCores(lastCpu) : "—",
            cpuLimit != null ? formatCores(cpuLimit) : null,
            usage.cpu.map((s) => s.v),
            "stroke-primary",
          )}
          {row(
            "Memory",
            lastMem !== undefined ? formatBytes(lastMem) : "—",
            memLimit != null ? formatBytes(memLimit) : null,
            usage.memory.map((s) => s.v),
            "stroke-success",
          )}
        </div>
      </WidgetCard>
    );
  },
);

export default ResourceUsageWidget;
