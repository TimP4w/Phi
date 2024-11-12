import { KustomizationNode } from "../../../core/fluxTree/models/tree";
import "./panel.scss";
import { formatDistance } from "date-fns";

type KustomizationInfoProps = {
  node: KustomizationNode | null;
};

export const KustomizationInfo = ({ node }: KustomizationInfoProps) => {
  if (!node) {
    return <div className="kustomization-info">No Node</div>;
  }

  return (
    <div className="kustomization-info">
      <div className="kustomization-info__row">
        <span>Path: </span>
        <span>{node.metadata?.path}</span>
      </div>
      <div className="kustomization-info__row">
        <span>IsReconciling: </span>
        <span>{node.fluxMetadata?.isReconciling.toString()}</span>
      </div>
      <div className="kustomization-info__row">
        <span>IsSuspended: </span>
        <span>{node.fluxMetadata?.isSuspended.toString()}</span>
      </div>
      <div className="kustomization-info__row">
        <span>Last Applied Revision: </span>
        <span>{node.metadata?.lastAppliedRevision}</span>
      </div>
      <div className="kustomization-info__row">
        <span>Last Attempted Revision: </span>
        <span>{node.metadata?.lastAttemptedRevision}</span>
      </div>
      <div className="kustomization-info__row">
        <span>Last Handled Reconciliation: </span>
        <span>
          {formatDistance(
            node.fluxMetadata?.lastHandledReconcileAt || new Date(),
            new Date(),
            {
              addSuffix: true,
            }
          )}
        </span>
      </div>
    </div>
  );
};
