import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import {
  Chip,
  Modal,
  ModalBody,
  ModalHeader,
  ProgressBar,
} from "@heroui/react";
import { Node } from "../../../core/fluxTree/models/tree";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { formatBytes, formatCores, usageColor } from "../../shared/format";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  node: Node | null;
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="flex justify-between items-center gap-4 py-1.5 border-b border-border last:border-b-0">
    <span className="text-xs text-muted flex-shrink-0">{label}</span>
    <span className="text-xs font-mono text-muted text-right break-all">
      {value || "—"}
    </span>
  </div>
);

const NodeDetailModal: React.FC<Props> = observer(
  ({ isOpen, onOpenChange, node }) => {
    const metricsStore = useInjection(MetricsStore);

    if (!node) return null;

    const meta = node.metadata;
    const usage = metricsStore.prometheusActive
      ? metricsStore.nodeUsage.find((u) => u.node === node.name)
      : undefined;

    return (
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.CloseTrigger className="absolute right-3 top-3 z-10" />
            <ModalHeader className="flex items-center gap-2">
              <span className="truncate">{node.name}</span>
              <Chip
                size="sm"
                variant="soft"
                color={node.isReady ? "success" : "danger"}
              >
                {node.isReady ? "Ready" : "Not Ready"}
              </Chip>
              {meta?.unschedulable && (
                <Chip size="sm" variant="soft" color="warning">
                  Cordoned
                </Chip>
              )}
            </ModalHeader>
            <ModalBody className="pb-6">
              {usage && (
                <div className="flex flex-col gap-2 pb-2">
                  <ProgressBar
                    size="sm"
                    value={usage.cpu.percent}
                    color={usageColor(usage.cpu.percent, "accent")}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span>{`CPU ${formatCores(usage.cpu.used)} / ${formatCores(usage.cpu.capacity)}`}</span>
                      <ProgressBar.Output />
                    </div>
                    <ProgressBar.Track>
                      <ProgressBar.Fill />
                    </ProgressBar.Track>
                  </ProgressBar>
                  <ProgressBar
                    size="sm"
                    value={usage.memory.percent}
                    color={usageColor(usage.memory.percent)}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span>{`Mem ${formatBytes(usage.memory.used)} / ${formatBytes(usage.memory.capacity)}`}</span>
                      <ProgressBar.Output />
                    </div>
                    <ProgressBar.Track>
                      <ProgressBar.Fill />
                    </ProgressBar.Track>
                  </ProgressBar>
                </div>
              )}
              <div className="flex flex-col">
                <Row
                  label="Roles"
                  value={meta?.roles?.length ? meta.roles.join(", ") : "—"}
                />
                <Row label="Internal IP" value={meta?.internalIP} />
                <Row label="OS" value={meta?.os} />
                <Row label="Architecture" value={meta?.architecture} />
                <Row label="OS image" value={meta?.osImage} />
                <Row label="Kernel" value={meta?.kernelVersion} />
                <Row label="Kubelet" value={meta?.kubeletVersion} />
                <Row label="Container runtime" value={meta?.containerRuntime} />
                <Row label="Created" value={node.createdAt.toLocaleString()} />
              </div>
            </ModalBody>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    );
  },
);

export default NodeDetailModal;
