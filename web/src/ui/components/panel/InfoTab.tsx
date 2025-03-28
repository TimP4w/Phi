import {
  DeploymentNode,
  KustomizationNode,
  PersistentVolumeClaimNode,
  PodNode,
  TreeNode,
} from "../../../core/fluxTree/models/tree";
import "./panel.scss";
import { InfoRow } from "./InfoRow";

type InfoTab = {
  node: TreeNode | null;
};

export const InfoTab = ({ node }: InfoTab) => {
  if (!node) {
    return <div className="info-tab">No Node</div>;
  }

  const getKustomizationData = (node: KustomizationNode) => {
    return (
      <>
        <InfoRow name="Path" value={node.metadata?.path} />
        <InfoRow
          name="Is Reconciling"
          value={node.fluxMetadata?.isReconciling}
        />
        <InfoRow name="Is Suspended" value={node.fluxMetadata?.isSuspended} />
        <InfoRow
          name="Last Applied Revision"
          value={node.metadata?.lastAppliedRevision}
        />
        <InfoRow
          name="Last Attempted Revision"
          value={node.metadata?.lastAttemptedRevision}
        />
        <InfoRow
          name="Last Handled Reconciliation"
          value={node.fluxMetadata?.lastHandledReconcileAt}
        />
      </>
    );
  };

  const getDeploymentData = (node: DeploymentNode) => {
    return (
      <>
        <InfoRow name="Replicas" value={node.metadata?.replicas.toString()} />
        <InfoRow
          name="Available Replicas"
          value={node.metadata?.availableReplicas.toString()}
        />
        <InfoRow
          name="Ready Replicas"
          value={node.metadata?.readyReplicas.toString()}
        />
        <InfoRow
          name="Updated Replicas"
          value={node.metadata?.updatedReplicas.toString()}
        />
      </>
    );
  };

  const getPodData = (node: PodNode) => {
    return (
      <>
        <InfoRow name="Image" value={node.metadata?.image} />
        <InfoRow name="Phase" value={node.metadata?.phase.toString()} />
      </>
    );
  };

  const getPVCData = (node: PersistentVolumeClaimNode) => {
    return (
      <>
        <InfoRow
          name="Access Modes"
          value={node.metadata?.accessModes.join(", ")}
        />
        <InfoRow name="Storage Class" value={node.metadata?.storageClass} />
        <InfoRow name="Volume Mode" value={node.metadata?.volumeMode} />
        <InfoRow name="Volume Name" value={node.metadata?.volumeName} />
        <InfoRow name="Phase" value={node.metadata?.phase.toString()} />
      </>
    );
  };

  return (
    <table className="info-tab__table">
      <tbody>
        <InfoRow name="Name" value={node.name} />
        <InfoRow name="Namespace" value={node.namespace} />
        <InfoRow name="Kind" value={node.kind} />
        <InfoRow name="Resource" value={node.resource} />
        <InfoRow name="Group" value={node.group} />
        <InfoRow name="Version" value={node.version} />
        <InfoRow name="UID" value={node.uid} />
        <InfoRow
          name="Is FluxCD Managed"
          value={node.isFluxManaged.toString()}
        />
        <InfoRow name="Status" value={node.status} />
        <InfoRow name="Children" value={node.children.length.toString()} />
        <InfoRow name="Events" value={node.events.length.toString()} />
        <InfoRow
          name="Is Reconcillable"
          value={node.isReconcillable.toString()}
        />
        <InfoRow name="Created At" value={node.createdAt} />
        {node.kind === "Kustomization" &&
          getKustomizationData(node as KustomizationNode)}
        {node.kind === "Deployment" &&
          getDeploymentData(node as DeploymentNode)}
        {node.kind === "Pod" && getPodData(node as PodNode)}
        {node.kind === "PersistentVolumeClaim" &&
          getPVCData(node as PersistentVolumeClaimNode)}
      </tbody>
    </table>
  );
};
