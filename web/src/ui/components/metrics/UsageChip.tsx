import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { TriangleAlert } from "lucide-react";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { formatBytes, formatCores } from "../../shared/format";

type UsageChipProps = {
  uid: string;
};

// UsageChip is an over-limit indicator: it renders only when current CPU or
// memory usage exceeds the resource's defined limit. A resource with no limit
// (nothing to exceed) shows nothing.
const UsageChip = observer(({ uid }: UsageChipProps) => {
  const metricsStore = useInjection(MetricsStore);
  if (!metricsStore.prometheusActive) return null;
  const usage = metricsStore.currentUsage.get(uid);
  if (!usage) return null;

  const lastCpu = usage.cpu[usage.cpu.length - 1]?.v;
  const lastMem = usage.memory[usage.memory.length - 1]?.v;
  const cpuLimit = usage.spec.cpu.limits;
  const memLimit = usage.spec.memory.limits;

  const cpuOver = lastCpu !== undefined && cpuLimit != null && lastCpu > cpuLimit;
  const memOver = lastMem !== undefined && memLimit != null && lastMem > memLimit;

  if (!cpuOver && !memOver) return null;

  return (
    <div className="flex items-center gap-3 text-[10px] text-danger font-mono">
      {cpuOver && (
        <span className="flex items-center gap-1" title="CPU usage over limit">
          <TriangleAlert className="w-2.5 h-2.5" />
          {formatCores(lastCpu!)} / {formatCores(cpuLimit!)}
        </span>
      )}
      {memOver && (
        <span className="flex items-center gap-1" title="Memory usage over limit">
          <TriangleAlert className="w-2.5 h-2.5" />
          {formatBytes(lastMem!)} / {formatBytes(memLimit!)}
        </span>
      )}
    </div>
  );
});

export default UsageChip;
