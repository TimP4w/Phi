import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { Progress } from "@heroui/react";
import WidgetCard from "./Widget";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { formatBytes, formatCores, usageColor } from "../../shared/format";

const NodeUsageWidget: React.FC = observer(() => {
  const metricsStore = useInjection(MetricsStore);
  if (!metricsStore.prometheusActive || metricsStore.nodeUsage.length === 0) return null;

  return (
    <WidgetCard title="Cluster Nodes" subtitle="CPU & memory usage">
      <div className="flex flex-col gap-3">
        {metricsStore.nodeUsage.map((n) => (
          <div key={n.node} className="flex flex-col gap-1">
            <span className="text-sm font-medium truncate">{n.node}</span>
            <Progress
              size="sm"
              value={n.cpu.percent}
              color={usageColor(n.cpu.percent, "primary")}
              label={`CPU ${formatCores(n.cpu.used)} / ${formatCores(n.cpu.capacity)}`}
              showValueLabel
              classNames={{ label: "text-xs", value: "text-xs" }}
            />
            <Progress
              size="sm"
              value={n.memory.percent}
              color={usageColor(n.memory.percent)}
              label={`Mem ${formatBytes(n.memory.used)} / ${formatBytes(n.memory.capacity)}`}
              showValueLabel
              classNames={{ label: "text-xs", value: "text-xs" }}
            />
          </div>
        ))}
      </div>
    </WidgetCard>
  );
});

export default NodeUsageWidget;
