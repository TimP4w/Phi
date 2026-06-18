import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import {
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Progress,
} from "@heroui/react";
import { Node } from "../../../core/fluxTree/models/tree";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { formatBytes, formatCores, usageColor } from "../../shared/format";

type Props = {
  isOpen: boolean;
  onOpenChange: () => void;
  node: Node | null;
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="flex justify-between items-center gap-4 py-1.5 border-b border-default-100 last:border-b-0">
    <span className="text-xs text-default-400 flex-shrink-0">{label}</span>
    <span className="text-xs font-mono text-default-200 text-right break-all">
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
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="lg"
        scrollBehavior="inside"
        className="dark"
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <span className="truncate">{node.name}</span>
            <Chip
              size="sm"
              variant="flat"
              color={node.isReady ? "success" : "danger"}
            >
              {node.isReady ? "Ready" : "Not Ready"}
            </Chip>
            {meta?.unschedulable && (
              <Chip size="sm" variant="flat" color="warning">
                Cordoned
              </Chip>
            )}
          </ModalHeader>
          <ModalBody className="pb-6">
            {usage && (
              <div className="flex flex-col gap-2 pb-2">
                <Progress
                  size="sm"
                  value={usage.cpu.percent}
                  color={usageColor(usage.cpu.percent, "primary")}
                  label={`CPU ${formatCores(usage.cpu.used)} / ${formatCores(usage.cpu.capacity)}`}
                  showValueLabel
                  classNames={{ label: "text-xs", value: "text-xs" }}
                />
                <Progress
                  size="sm"
                  value={usage.memory.percent}
                  color={usageColor(usage.memory.percent)}
                  label={`Mem ${formatBytes(usage.memory.used)} / ${formatBytes(usage.memory.capacity)}`}
                  showValueLabel
                  classNames={{ label: "text-xs", value: "text-xs" }}
                />
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
        </ModalContent>
      </Modal>
    );
  },
);

export default NodeDetailModal;
