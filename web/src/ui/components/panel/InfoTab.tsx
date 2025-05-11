import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from "@heroui/react";
import {
  DeploymentNode,
  KustomizationNode,
  PersistentVolumeClaimNode,
  PodNode,
  TreeNode,
} from "../../../core/fluxTree/models/tree";
import { RowElement } from "@react-types/table";
import { formatDistance } from "date-fns";

type InfoTab = {
  node: TreeNode | null;
};

export const InfoTab = ({ node }: InfoTab) => {
  if (!node) {
    return <div className="info-tab">No Node</div>;
  }

  const extraRows: RowElement<unknown>[] = [];

  const getKustomizationData = (
    node: KustomizationNode
  ): RowElement<unknown>[] => [
    <TableRow>
      <TableCell>Path</TableCell>
      <TableCell>{node.metadata?.path}</TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Is Reconciling</TableCell>
      <TableCell>{node.fluxMetadata?.isReconciling}</TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Is Suspended</TableCell>
      <TableCell>{node.fluxMetadata?.isSuspended}</TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Last Applied Revision</TableCell>
      <TableCell>{node.metadata?.lastAppliedRevision}</TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Last Attempted Revision</TableCell>
      <TableCell>{node.metadata?.lastAttemptedRevision}</TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Last Handled Reconciliation</TableCell>
      <TableCell>
        {node.fluxMetadata?.lastHandledReconcileAt?.toString()}
      </TableCell>
    </TableRow>,
  ];

  const getDeploymentData = (node: DeploymentNode): RowElement<unknown>[] => [
    <TableRow>
      <TableCell>Replicas</TableCell>
      <TableCell>{node.metadata?.replicas.toString()}</TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Available Replicas</TableCell>
      <TableCell>{node.metadata?.availableReplicas.toString()}</TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Ready Replicas</TableCell>
      <TableCell>{node.metadata?.readyReplicas.toString()}</TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Updated Replicas</TableCell>
      <TableCell>{node.metadata?.updatedReplicas.toString()}</TableCell>
    </TableRow>,
  ];

  const getPodData = (node: PodNode): RowElement<unknown>[] => [
    <TableRow>
      <TableCell>Image</TableCell>
      <TableCell>
        <Chip>{node.metadata?.image}</Chip>
      </TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Phase</TableCell>
      <TableCell>{node.metadata?.phase.toString()}</TableCell>
    </TableRow>,
  ];

  const getPVCData = (
    node: PersistentVolumeClaimNode
  ): RowElement<unknown>[] => [
    <TableRow>
      <TableCell>Access Modes</TableCell>
      <TableCell>{node.metadata?.accessModes.join(", ")}</TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Storage Class</TableCell>
      <TableCell>{node.metadata?.storageClass}</TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Volume Mode</TableCell>
      <TableCell>{node.metadata?.volumeMode}</TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Volume Name</TableCell>
      <TableCell>{node.metadata?.volumeName}</TableCell>
    </TableRow>,
    <TableRow>
      <TableCell>Phase</TableCell>
      <TableCell>{node.metadata?.phase.toString()}</TableCell>
    </TableRow>,
  ];

  if (node.kind === "Kustomization") {
    extraRows.push(...getKustomizationData(node as KustomizationNode));
  }
  if (node.kind === "Deployment") {
    extraRows.push(...getDeploymentData(node as DeploymentNode));
  }
  if (node.kind === "Pod") {
    extraRows.push(...getPodData(node as PodNode));
  }
  if (node.kind === "PersistentVolumeClaim") {
    extraRows.push(...getPVCData(node as PersistentVolumeClaimNode));
  }

  return (
    <div>
      <Table hideHeader removeWrapper>
        <TableHeader>
          <TableColumn>Property</TableColumn>
          <TableColumn>Value</TableColumn>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>UID</TableCell>
            <TableCell>{node.uid}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>{node.name}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Namespace</TableCell>
            <TableCell>{node.namespace}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Kind</TableCell>
            <TableCell>{node.kind}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Resource</TableCell>
            <TableCell>{node.resource}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Group</TableCell>
            <TableCell>{node.group}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Version</TableCell>
            <TableCell>{node.version}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Annotations</TableCell>
            <TableCell className="flex flex-wrap gap-1">
              {node.annotations
                ? Array.from(node.annotations).map(([key, value]) => (
                    <Chip key={key}>
                      {key}={value}
                    </Chip>
                  ))
                : ""}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Labels</TableCell>
            <TableCell className="flex flex-wrap gap-1">
              {node.labels
                ? Array.from(node.labels).map(([key, value]) => (
                    <Chip key={key}>
                      {key}={value}
                    </Chip>
                  ))
                : ""}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Is FluxCD Managed</TableCell>
            <TableCell>{node.isFluxManaged.toString()}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Status</TableCell>
            <TableCell>{node.status}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Children</TableCell>
            <TableCell>{node.children.length.toString()}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Events</TableCell>
            <TableCell>{node.events.length.toString()}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Is Reconcillable</TableCell>
            <TableCell>{node.isReconcillable.toString()}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Created At</TableCell>
            <TableCell>
              <Tooltip content={node.createdAt.toDateString()}>
                {formatDistance(node.createdAt.toDateString(), new Date(), {
                  includeSeconds: true,
                  addSuffix: true,
                })}
              </Tooltip>
            </TableCell>
          </TableRow>
          {extraRows as unknown as RowElement<unknown>}
        </TableBody>
      </Table>
    </div>
  );
};
