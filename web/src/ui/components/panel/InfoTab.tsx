import { Chip } from "@heroui/react";
import {
  Deployment,
  HelmRelease,
  Kustomization,
  PersistentVolumeClaim,
  Pod,
  KubeResource,
} from "../../../core/fluxTree/models/tree";
import TooltipedDate from "../tooltiped-date/TooltipedDate";

type InfoTabProps = {
  resource: KubeResource | null;
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
          <InfoRow label="Reconciling" value={n.metadata?.isReconciling?.toString()} />
          <InfoRow label="Suspended" value={n.metadata?.isSuspended?.toString()} />
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
      return (
        <Section title="Pod">
          <InfoRow label="Phase" value={n.metadata?.phase?.toString()} />
          <InfoRow
            label="Image"
            value={
              <Chip size="sm" variant="flat" className="font-mono text-xs">
                {n.metadata?.image}
              </Chip>
            }
          />
        </Section>
      );
    }
    case "PersistentVolumeClaim": {
      const n = resource as PersistentVolumeClaim;
      return (
        <Section title="Persistent Volume Claim">
          <InfoRow label="Phase" value={n.metadata?.phase?.toString()} />
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
    default:
      return null;
  }
};

export const InfoTab = ({ resource }: InfoTabProps) => {
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
        <InfoRow label="Events" value={resource.events.length.toString()} />
        <InfoRow
          label="Reconcillable"
          value={resource.isReconcillable.toString()}
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
    </div>
  );
};
