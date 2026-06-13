import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { Progress } from "@heroui/react";
import WidgetCard from "./Widget";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { LonghornNode, LonghornVolume } from "../../../core/fluxTree/models/tree";
import { formatBytes } from "../../shared/format";

const LonghornVolumesWidget: React.FC = observer(() => {
  const fluxTreeStore = useInjection(FluxTreeStore);

  const volumes: LonghornVolume[] = [];
  const nodes: LonghornNode[] = [];
  fluxTreeStore.resources.forEach((r) => {
    if (r instanceof LonghornVolume) volumes.push(r);
    else if (r instanceof LonghornNode) nodes.push(r);
  });

  // Only surface the widget when Longhorn is actually installed.
  if (volumes.length === 0 && nodes.length === 0) return null;

  // Volume health counts.
  const counts = { healthy: 0, degraded: 0, faulted: 0 };
  for (const v of volumes) {
    if (v.metadata?.robustness === "healthy") counts.healthy++;
    else if (v.metadata?.robustness === "degraded") counts.degraded++;
    else if (v.metadata?.robustness === "faulted") counts.faulted++;
  }

  // Cluster storage, aggregated from the Longhorn node disks.
  const storage = { total: 0, used: 0, reserved: 0, schedulable: 0, disabled: 0 };
  for (const n of nodes) {
    storage.total += n.metadata?.storageMaximum ?? 0;
    storage.used += n.metadata?.storageUsed ?? 0;
    storage.reserved += n.metadata?.storageReserved ?? 0;
    storage.schedulable += n.metadata?.storageSchedulable ?? 0;
    storage.disabled += n.metadata?.storageDisabled ?? 0;
  }
  const usedPct = storage.total > 0 ? Math.min(100, (storage.used / storage.total) * 100) : 0;

  const healthStats: { label: string; value: number; color: string }[] = [
    { label: "Healthy", value: counts.healthy, color: "text-success" },
    { label: "Degraded", value: counts.degraded, color: "text-warning" },
    { label: "Faulted", value: counts.faulted, color: "text-danger" },
  ];

  const storageStats: { label: string; value: number }[] = [
    { label: "Schedulable", value: storage.schedulable },
    { label: "Reserved", value: storage.reserved },
    { label: "Used", value: storage.used },
    { label: "Disabled", value: storage.disabled },
    { label: "Total", value: storage.total },
  ];

  return (
    <WidgetCard title="Longhorn" subtitle={`${volumes.length} volumes`}>
      <div className="flex flex-col gap-4">
        {volumes.length > 0 && (
          <div className="flex justify-between">
            {healthStats.map((s) => (
              <div key={s.label} className="flex flex-col items-center">
                <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
                <span className="text-xs text-default-400">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {nodes.length > 0 && (
          <div className="flex flex-col gap-2">
            <Progress
              size="sm"
              value={usedPct}
              color={usedPct > 90 ? "danger" : usedPct > 75 ? "warning" : "success"}
              label={`Used ${formatBytes(storage.used)} / ${formatBytes(storage.total)}`}
              showValueLabel
              classNames={{ label: "text-xs", value: "text-xs" }}
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {storageStats.map((s) => (
                <div key={s.label} className="flex justify-between text-xs">
                  <span className="text-default-400">{s.label}</span>
                  <span className="font-mono">{formatBytes(s.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </WidgetCard>
  );
});

export default LonghornVolumesWidget;
