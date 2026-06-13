import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { Progress, useDisclosure } from "@heroui/react";
import WidgetCard from "./Widget";
import LonghornVolumesModal from "./LonghornVolumesModal";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import {
  LonghornNode,
  LonghornVolume,
} from "../../../core/fluxTree/models/tree";
import { formatBytes, usageColor, usagePercent } from "../../shared/format";
type Robustness = "healthy" | "degraded" | "faulted";

const LonghornVolumesWidget: React.FC = observer(() => {
  const fluxTreeStore = useInjection(FluxTreeStore);
  const volumesModal = useDisclosure();
  const [modalFilter, setModalFilter] = useState<Robustness | undefined>(
    undefined,
  );

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
  const storage = {
    total: 0,
    used: 0,
    reserved: 0,
    schedulable: 0,
    disabled: 0,
  };
  for (const n of nodes) {
    storage.total += n.metadata?.storageMaximum ?? 0;
    storage.used += n.metadata?.storageUsed ?? 0;
    storage.reserved += n.metadata?.storageReserved ?? 0;
    storage.schedulable += n.metadata?.storageSchedulable ?? 0;
    storage.disabled += n.metadata?.storageDisabled ?? 0;
  }
  const usedPct = usagePercent(storage.used, storage.total);

  const healthStats: {
    label: string;
    value: number;
    color: string;
    robustness: Robustness;
  }[] = [
    {
      label: "Healthy",
      value: counts.healthy,
      color: "text-success",
      robustness: "healthy",
    },
    {
      label: "Degraded",
      value: counts.degraded,
      color: "text-warning",
      robustness: "degraded",
    },
    {
      label: "Faulted",
      value: counts.faulted,
      color: "text-danger",
      robustness: "faulted",
    },
  ];

  const openModal = (robustness?: Robustness) => {
    setModalFilter(robustness);
    volumesModal.onOpen();
  };

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
              <button
                key={s.label}
                type="button"
                onClick={() => openModal(s.robustness)}
                className="flex flex-col items-center hover:opacity-80 transition-opacity"
              >
                <span className={`text-2xl font-bold ${s.color}`}>
                  {s.value}
                </span>
                <span className="text-xs text-default-400">{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {nodes.length > 0 && (
          <div className="flex flex-col gap-2">
            <Progress
              size="sm"
              value={usedPct}
              color={usageColor(usedPct)}
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

      <LonghornVolumesModal
        isOpen={volumesModal.isOpen}
        onOpenChange={volumesModal.onOpenChange}
        volumes={volumes}
        initialFilter={modalFilter}
      />
    </WidgetCard>
  );
});

export default LonghornVolumesWidget;
