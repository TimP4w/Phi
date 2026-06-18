import { Chip } from "@heroui/react";
import {
  Container,
  Deployment,
  HelmRelease,
  Kustomization,
  LonghornVolume,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  KubeResource,
  sumRequestedStorage,
} from "../../../core/fluxTree/models/tree";
import TooltipedDate from "../tooltiped-date/TooltipedDate";
import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { EventsStore } from "../../../core/fluxTree/stores/events.store";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { formatBytes, usageColor, usagePercent } from "../../shared/format";
import { robustnessColor } from "../../../core/fluxTree/constants/resources.const";
import { containerStateColor } from "./containerStatus";

type InfoTabProps = {
  resource: KubeResource | null;
  hideStorage?: boolean;
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="mb-6">
    <p className="text-xs font-semibold text-default-400 uppercase tracking-widest mb-2 px-2">
      {title}
    </p>
    <div className="space-y-0.5">{children}</div>
  </div>
);

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) => (
  <div className="flex items-start justify-between gap-6 px-2 py-1.5 rounded-lg hover:bg-default-50 group">
    <span className="text-sm text-default-400 flex-shrink-0 w-40">{label}</span>
    <span className="text-xs font-mono text-right break-all">
      {value ?? <span className="text-default-300">—</span>}
    </span>
  </div>
);

const KVChips = ({ entries }: { entries: Map<string, string> }) => (
  <div className="flex flex-wrap gap-1.5 px-2 py-1">
    {Array.from(entries).map(([k, v]) => (
      <div
        key={k}
        className="flex text-xs rounded-md overflow-hidden border border-default-200 max-w-full"
      >
        <span className="px-2 py-0.5 bg-default-100 text-default-400 truncate max-w-[160px]">
          {k}
        </span>
        <span className="px-2 py-0.5 font-mono truncate max-w-[200px]">{v}</span>
      </div>
    ))}
  </div>
);

export const ContainerRow = ({ container }: { container: Container }) => {
  const color = containerStateColor(container);
  const status = container.reason || container.state || "Unknown";
  return (
    <div className="flex flex-col gap-1 px-2 py-2 rounded-lg hover:bg-default-50 border-b border-default-100 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {container.isInit && (
            <Chip size="sm" variant="flat" color="default" className="text-[10px]">
              init
            </Chip>
          )}
          <span className="text-sm font-medium truncate">{container.name}</span>
        </div>
        <Chip size="sm" variant="flat" color={color} className="flex-shrink-0">
          {status}
        </Chip>
      </div>
      <span className="text-xs font-mono text-default-400 break-all">
        {container.image}
      </span>
      <div className="flex items-center gap-3 text-xs text-default-400">
        <span>{container.ready ? "Ready" : "Not Ready"}</span>
        <span>Restarts: {container.restartCount}</span>
        {container.state === "Terminated" && (
          <span>Exit: {container.exitCode ?? 0}</span>
        )}
      </div>
      {container.message && (
        <span className="text-xs text-danger break-all">{container.message}</span>
      )}
    </div>
  );
};

const renderKindFields = (resource: KubeResource) => {
  switch (resource.kind) {
    case "Kustomization": {
      const n = resource as Kustomization;
      const applied = n.metadata?.lastAppliedRevision ?? "";
      const attempted = n.metadata?.lastAttemptedRevision ?? "";
      const hasDrift = applied && attempted && applied !== attempted;
      return (
        <Section title="Kustomization">
          <InfoRow label="Path" value={n.metadata?.path} />
          <InfoRow label="Reconciling" value={n.isReconciling.toString()} />
          <InfoRow label="Suspended" value={n.isSuspended.toString()} />
          <InfoRow
            label="Applied Revision"
            value={
              <span className={hasDrift ? "text-warning" : undefined}>
                {applied}
              </span>
            }
          />
          <InfoRow
            label="Attempted Revision"
            value={
              <span className={hasDrift ? "text-warning font-bold" : undefined}>
                {attempted}
              </span>
            }
          />
          <InfoRow
            label="Last Reconcile"
            value={<TooltipedDate date={n.lastHandledReconcileAt} />}
          />
          <InfoRow
            label="Last Sync"
            value={<TooltipedDate date={n.lastSyncAt} />}
          />
        </Section>
      );
    }
    case "HelmRelease": {
      const n = resource as HelmRelease;
      return (
        <Section title="HelmRelease">
          <InfoRow label="Chart" value={n.metadata?.chartName} />
          <InfoRow label="Version" value={n.metadata?.chartVersion} />
          <InfoRow
            label="Source"
            value={
              n.metadata?.sourceRef
                ? `${n.metadata.sourceRef.name} (${n.metadata.sourceRef.kind})`
                : undefined
            }
          />
          <InfoRow label="Reconciling" value={n.isReconciling.toString()} />
          <InfoRow label="Suspended" value={n.isSuspended.toString()} />
        </Section>
      );
    }
    case "Deployment": {
      const n = resource as Deployment;
      return (
        <Section title="Deployment">
          <InfoRow label="Replicas" value={n.metadata?.replicas?.toString()} />
          <InfoRow
            label="Available"
            value={n.metadata?.availableReplicas?.toString()}
          />
          <InfoRow
            label="Ready"
            value={n.metadata?.readyReplicas?.toString()}
          />
          <InfoRow
            label="Updated"
            value={n.metadata?.updatedReplicas?.toString()}
          />
          {n.metadata?.images && n.metadata.images.length > 0 && (
            <div className="px-2 py-1.5">
              <p className="text-sm text-default-400 mb-1.5">Images</p>
              <div className="flex flex-wrap gap-1.5">
                {n.metadata.images.map((img) => (
                  <Chip key={img} size="sm" variant="flat" className="font-mono text-xs">
                    {img}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </Section>
      );
    }
    case "Pod": {
      const n = resource as Pod;
      const images = Array.from(
        new Set((n.metadata?.containers ?? []).map((c) => c.image).filter(Boolean))
      );
      if (images.length === 0 && n.metadata?.image) images.push(n.metadata.image);
      return (
        <Section title="Pod">
          <InfoRow label="Phase" value={n.metadata?.phase?.toString()} />
          {images.length > 0 && (
            <div className="px-2 py-1.5">
              <p className="text-sm text-default-400 mb-1.5">
                {images.length > 1 ? "Images" : "Image"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {images.map((img) => (
                  <Chip key={img} size="sm" variant="flat" className="font-mono text-xs">
                    {img}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </Section>
      );
    }
    case "PersistentVolumeClaim": {
      const n = resource as PersistentVolumeClaim;
      const requested = n.metadata?.requested ?? 0;
      return (
        <Section title="Persistent Volume Claim">
          <InfoRow label="Phase" value={n.metadata?.phase?.toString()} />
          <InfoRow
            label="Requested"
            value={requested > 0 ? formatBytes(requested) : undefined}
          />
          <InfoRow label="Storage Class" value={n.metadata?.storageClass} />
          <InfoRow label="Volume Name" value={n.metadata?.volumeName} />
          <InfoRow label="Volume Mode" value={n.metadata?.volumeMode} />
          <InfoRow
            label="Access Modes"
            value={n.metadata?.accessModes?.join(", ")}
          />
        </Section>
      );
    }
    case "PersistentVolume": {
      if (!(resource instanceof PersistentVolume)) return null;
      const n = resource as PersistentVolume;
      const capacity = n.metadata?.capacity ?? 0;
      return (
        <Section title="Persistent Volume">
          <InfoRow label="Phase" value={n.metadata?.phase} />
          <InfoRow
            label="Capacity"
            value={capacity > 0 ? formatBytes(capacity) : undefined}
          />
          <InfoRow label="Storage Class" value={n.metadata?.storageClass} />
          <InfoRow label="Driver" value={n.metadata?.driver} />
          <InfoRow label="Reclaim Policy" value={n.metadata?.reclaimPolicy} />
          <InfoRow label="Volume Mode" value={n.metadata?.volumeMode} />
          <InfoRow
            label="Access Modes"
            value={n.metadata?.accessModes?.join(", ")}
          />
          <InfoRow label="NFS Server" value={n.metadata?.nfsServer} />
          <InfoRow label="NFS Share" value={n.metadata?.nfsShare} />
        </Section>
      );
    }
    case "Volume": {
      if (!(resource instanceof LonghornVolume)) return null;
      const n = resource as LonghornVolume;
      const size = n.metadata?.size ?? 0;
      const used = n.metadata?.actualSize ?? 0;
      const pct = usagePercent(used, size);
      const robustness = n.metadata?.robustness ?? "unknown";
      return (
        <Section title="Longhorn Volume">
          <InfoRow
            label="Robustness"
            value={
              <Chip size="sm" variant="flat" color={robustnessColor(robustness)}>
                {robustness}
              </Chip>
            }
          />
          <InfoRow label="State" value={n.metadata?.state} />
          <InfoRow
            label="Usage"
            value={
              <div className="flex flex-col items-end gap-1 w-40">
                <span>
                  {formatBytes(used)} / {formatBytes(size)} ({pct.toFixed(0)}%)
                </span>
                <div className="w-full h-1.5 rounded-full bg-default-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-${usageColor(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            }
          />
          <InfoRow label="Replicas" value={n.metadata?.numberOfReplicas?.toString()} />
          <InfoRow label="Attached Node" value={n.metadata?.nodeID} />
          <InfoRow label="Frontend" value={n.metadata?.frontend} />
          <InfoRow label="Access Mode" value={n.metadata?.accessMode} />
        </Section>
      );
    }
    default:
      return null;
  }
};

// StorageRollup totals the storage requested by every PVC in a resource's
// subtree (e.g. a Kustomization) and pairs it with measured usage from
// Prometheus when available. Hidden for resources that own no PVCs.
export const StorageRollup = observer(({ resource }: { resource: KubeResource }) => {
  const metricsStore = useInjection(MetricsStore);
  const { requested, pvcCount } = sumRequestedStorage(resource);
  if (pvcCount === 0) return null;

  const usage = metricsStore.storageUsage.get(resource.uid);
  const used = usage?.used;
  const measured = usage?.measured ?? 0;
  const pct = used != null && requested > 0 ? usagePercent(used, requested) : 0;

  return (
    <Section title="Storage">
      <InfoRow
        label="Requested"
        value={`${formatBytes(requested)} (${pvcCount} PVC${pvcCount === 1 ? "" : "s"})`}
      />
      {used != null ? (
        <InfoRow
          label="Used"
          value={
            <div className="flex flex-col items-end gap-1 w-40">
              <span>
                {formatBytes(used)} / {formatBytes(requested)} ({pct.toFixed(0)}%)
              </span>
              <div className="w-full h-1.5 rounded-full bg-default-100 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-${usageColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {measured < pvcCount && (
                <span className="text-default-300">
                  measured {measured}/{pvcCount}
                </span>
              )}
            </div>
          }
        />
      ) : (
        <InfoRow
          label="Used"
          value={
            <span className="text-default-300">
              {metricsStore.prometheusActive ? "—" : "Prometheus off"}
            </span>
          }
        />
      )}
    </Section>
  );
});

export const InfoTab = observer(({ resource, hideStorage }: InfoTabProps) => {
  const eventsStore = useInjection(EventsStore);

  if (!resource) {
    return (
      <p className="text-default-400 text-sm px-2">No resource selected.</p>
    );
  }

  const hasLabels = resource.labels && resource.labels.size > 0;
  const hasAnnotations = resource.annotations && resource.annotations.size > 0;

  return (
    <div className="space-y-0">
      <Section title="Identity">
        <InfoRow label="Name" value={resource.name} />
        <InfoRow label="Namespace" value={resource.namespace} />
        <InfoRow label="Kind" value={resource.kind} />
        <InfoRow
          label="API"
          value={[resource.group, resource.version, resource.resource]
            .filter(Boolean)
            .join(" / ")}
        />
        <InfoRow label="UID" value={resource.uid} />
      </Section>

      <Section title="Status">
        <InfoRow label="Status" value={resource.status} />
        <InfoRow
          label="Created"
          value={<TooltipedDate date={resource.createdAt} />}
        />
        <InfoRow label="Children" value={resource.children.length.toString()} />
        <InfoRow
          label="Events"
          value={eventsStore.eventsForResource(resource.uid).length.toString()}
        />
        <InfoRow
          label="Reconcilable"
          value={resource.isReconcilable.toString()}
        />
      </Section>

      {(hasLabels || hasAnnotations) && (
        <Section title="Metadata">
          {hasLabels && (
            <>
              <p className="text-sm text-default-400 px-2 mb-1">Labels</p>
              <KVChips entries={resource.labels!} />
            </>
          )}
          {hasAnnotations && (
            <>
              <p className="text-sm text-default-400 px-2 mt-3 mb-1">
                Annotations
              </p>
              <KVChips entries={resource.annotations!} />
            </>
          )}
        </Section>
      )}

      {renderKindFields(resource)}

      {!hideStorage && <StorageRollup resource={resource} />}
    </div>
  );
});
