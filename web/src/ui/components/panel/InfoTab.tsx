import { Chip, Divider } from "@heroui/react";
import {
  Deployment,
  Kustomization,
  PersistentVolumeClaim,
  Pod,
  KubeResource,
} from "../../../core/fluxTree/models/tree";
import TooltipedDate from "../tooltiped-date/TooltipedDate";

type InfoTabProps = {
  resource: KubeResource | null;
};

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) => (
  <div className="flex justify-between text-sm hover:bg-default-100 px-2 py-1 rounded">
    <span className="text-default-400">{label}</span>
    <span className="font-mono text-xs items-center">{value}</span>
  </div>
);

export const InfoTab = ({ resource }: InfoTabProps) => {
  if (!resource) return <div className="info-tab">No resource</div>;

  const renderExtraFields = () => {
    switch (resource.kind) {
      case "Kustomization": {
        const n = resource as Kustomization;
        return (
          <>
            <InfoRow label="Path" value={n.metadata?.path} />
            <InfoRow
              label="Is Reconciling"
              value={n.isReconciling.toString()}
            />
            <InfoRow label="Is Suspended" value={n.isSuspended.toString()} />
            <InfoRow
              label="Last Applied Revision"
              value={n.metadata?.lastAppliedRevision}
            />
            <InfoRow
              label="Last Attempted Revision"
              value={n.metadata?.lastAttemptedRevision}
            />
            <InfoRow
              label="Last Handled Reconciliation"
              value={<TooltipedDate date={n.lastHandledReconcileAt} />}
            />
            <InfoRow
              label="Last Handled Reconciliation"
              value={<TooltipedDate date={n.lastSyncAt} />}
            />
          </>
        );
      }
      case "Deployment": {
        const n = resource as Deployment;
        return (
          <>
            <InfoRow
              label="Replicas"
              value={n.metadata?.replicas?.toString()}
            />
            <InfoRow
              label="Available Replicas"
              value={n.metadata?.availableReplicas?.toString()}
            />
            <InfoRow
              label="Ready Replicas"
              value={n.metadata?.readyReplicas?.toString()}
            />
            <InfoRow
              label="Updated Replicas"
              value={n.metadata?.updatedReplicas?.toString()}
            />
          </>
        );
      }
      case "Pod": {
        const n = resource as Pod;
        return (
          <>
            <InfoRow label="Image" value={<Chip>{n.metadata?.image}</Chip>} />
            <InfoRow label="Phase" value={n.metadata?.phase.toString()} />
          </>
        );
      }
      case "PersistentVolumeClaim": {
        const n = resource as PersistentVolumeClaim;
        return (
          <>
            <InfoRow
              label="Access Modes"
              value={n.metadata?.accessModes.join(", ")}
            />
            <InfoRow label="Storage Class" value={n.metadata?.storageClass} />
            <InfoRow label="Volume Mode" value={n.metadata?.volumeMode} />
            <InfoRow label="Volume Name" value={n.metadata?.volumeName} />
            <InfoRow label="Phase" value={n.metadata?.phase.toString()} />
          </>
        );
      }
    }
  };

  return (
    <div className="space-y-2 text-sm">
      <InfoRow label="UID" value={resource.uid} />
      <InfoRow label="Name" value={resource.name} />
      <InfoRow label="Namespace" value={resource.namespace} />
      <InfoRow label="Kind" value={resource.kind} />
      <InfoRow label="Resource" value={resource.resource} />
      <InfoRow label="Group" value={resource.group} />
      <InfoRow label="Version" value={resource.version} />
      <InfoRow
        label="Annotations"
        value={
          resource.annotations ? (
            <div className="flex flex-wrap gap-1">
              {Array.from(resource.annotations).map(([k, v]) => (
                <Chip key={k}>{`${k}=${v}`}</Chip>
              ))}
            </div>
          ) : (
            ""
          )
        }
      />
      <InfoRow
        label="Labels"
        value={
          resource.labels ? (
            <div className="flex flex-wrap gap-1">
              {Array.from(resource.labels).map(([k, v]) => (
                <Chip key={k}>{`${k}=${v}`}</Chip>
              ))}
            </div>
          ) : (
            ""
          )
        }
      />
      <InfoRow label="Status" value={resource.status} />
      <InfoRow label="Children" value={resource.children.length.toString()} />
      <InfoRow label="Events" value={resource.events.length.toString()} />
      <InfoRow
        label="Is Reconcillable"
        value={resource.isReconcillable.toString()}
      />
      <InfoRow
        label="Created At"
        value={<TooltipedDate date={resource.createdAt} />}
      />
      <Divider />
      {renderExtraFields()}
    </div>
  );
};
