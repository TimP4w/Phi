import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import {
  Chip,
  Modal,
  ModalBody,
  ModalHeader,
  ProgressBar,
  useOverlayState,
} from "@heroui/react";
import { Cpu, MemoryStick } from "lucide-react";
import { Node } from "../../../core/fluxTree/models/tree";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { formatBytes, formatCores, usageColor } from "../../shared/format";
import NodeDetailModal from "../widgets/NodeDetailModal";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  nodes: Node[];
};

/** Lists every cluster node with live Prometheus CPU/memory usage; selecting one opens its detail modal. */
const NodesModal: React.FC<Props> = observer(
  ({ isOpen, onOpenChange, nodes }) => {
    const metricsStore = useInjection(MetricsStore);
    const detailModal = useOverlayState();
    const [selected, setSelected] = useState<Node | null>(null);

    const openDetail = (node: Node) => {
      setSelected(node);
      detailModal.open();
    };

    return (
      <>
        <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <Modal.CloseTrigger className="absolute right-3 top-3 z-10" />
              <ModalHeader className="flex items-center gap-2">
                Cluster Nodes
                <span className="text-sm font-normal text-muted">
                  ({nodes.length})
                </span>
              </ModalHeader>
              <ModalBody className="pb-6">
                <div className="flex flex-col gap-2">
                  {nodes.map((node) => {
                    const meta = node.metadata;
                    const usage = metricsStore.prometheusActive
                      ? metricsStore.nodeUsage.find((u) => u.node === node.name)
                      : undefined;
                    const osArch = [meta?.os, meta?.architecture]
                      .filter(Boolean)
                      .join("/");

                    return (
                      <button
                        key={node.uid}
                        type="button"
                        onClick={() => openDetail(node)}
                        className="flex flex-col gap-1.5 text-left rounded-lg p-3 border border-border hover:bg-surface-secondary transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                node.isReady ? "bg-success" : "bg-danger"
                              }`}
                            />
                            <span className="text-sm font-medium truncate">
                              {node.name}
                            </span>
                            {meta?.unschedulable && (
                              <Chip size="sm" variant="soft" color="warning">
                                Cordoned
                              </Chip>
                            )}
                          </div>
                          <span className="text-xs text-muted font-mono flex-shrink-0">
                            {meta?.internalIP}
                          </span>
                        </div>

                        {osArch && (
                          <span className="text-xs text-muted pl-4">
                            {osArch}
                          </span>
                        )}

                        {usage && (
                          <div className="flex flex-col gap-1 pt-0.5">
                            <ProgressBar
                              size="sm"
                              value={usage.cpu.percent}
                              color={usageColor(usage.cpu.percent, "accent")}
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1">
                                  <Cpu className="w-3 h-3" />
                                  {`${formatCores(usage.cpu.used)} / ${formatCores(usage.cpu.capacity)}`}
                                </span>
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
                                <span className="flex items-center gap-1">
                                  <MemoryStick className="w-3 h-3" />
                                  {`${formatBytes(usage.memory.used)} / ${formatBytes(usage.memory.capacity)}`}
                                </span>
                                <ProgressBar.Output />
                              </div>
                              <ProgressBar.Track>
                                <ProgressBar.Fill />
                              </ProgressBar.Track>
                            </ProgressBar>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ModalBody>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>

        <NodeDetailModal
          isOpen={detailModal.isOpen}
          onOpenChange={detailModal.setOpen}
          node={selected}
        />
      </>
    );
  },
);

export default NodesModal;
