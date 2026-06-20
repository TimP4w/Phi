import { observer } from "mobx-react-lite";
import { useOverlayState } from "@heroui/react";
import { KubeResource, ResourceStatus } from "../../../core/fluxTree/models/tree";
import ResourceListModal from "./ResourceListModal";
import HealthButton from "./HealthButton";
import { computeReconciliation } from "./reconciliation";

/** Tree-view section: a Reconciliations heading + health button; hidden when the subtree has no Flux objects. */
const ReconciliationSection: React.FC<{ root: KubeResource }> = observer(({ root }) => {
  const modal = useOverlayState();
  const data = computeReconciliation(root);
  if (data.apps.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2 px-2">
        {data.apps.length} Reconciliation{data.apps.length === 1 ? "" : "s"}
      </p>
      <HealthButton tone={data.tone} label={data.label} onClick={modal.open} />
      <ResourceListModal
        isOpen={modal.isOpen}
        onOpenChange={modal.setOpen}
        title="Applications"
        resources={data.apps}
        defaultStatuses={
          data.failed > 0
            ? new Set([ResourceStatus.FAILED])
            : data.reconciling > 0
              ? new Set([ResourceStatus.PENDING, ResourceStatus.WARNING])
              : undefined
        }
      />
    </div>
  );
});

export default ReconciliationSection;
