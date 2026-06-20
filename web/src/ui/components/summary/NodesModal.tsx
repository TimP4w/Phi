import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import {
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Progress,
  useDisclosure,
} from "@heroui/react";
import { Cpu, MemoryStick } from "lucide-react";
import { Node } from "../../../core/fluxTree/models/tree";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { formatBytes, formatCores, usageColor } from "../../shared/format";
import NodeDetailModal from "../widgets/NodeDetailModal";

type Props = {
  isOpen: boolean;
  onOpenChange: () => void;
  nodes: Node[];
};

/** Lists every cluster node with live Prometheus CPU/memory usage; selecting one opens its detail modal. */
const NodesModal: React.FC<Props> = observer(
  ({ isOpen, onOpenChange, nodes }) => {
    const metricsStore = useInjection(MetricsStore);
    const detailModal = useDisclosure();
    const [selected, setSelected] = useState<Node | null>(null);

    const openDetail = (node: Node) => {
      setSelected(node);
      detailModal.onOpen();
    };

    return (
      <>
        <Modal
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          size="2xl"
          scrollBehavior="inside"
          className="dark"
        >
          <ModalContent>
            <ModalHeader className="flex items-center gap-2">
              Cluster Nodes
              <span className="text-sm font-normal text-default-400">
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
                      className="flex flex-col gap-1.5 text-left rounded-lg p-3 border border-default-100 hover:bg-content2 transition-colors"
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
                            <Chip size="sm" variant="flat" color="warning">
                              Cordoned
                            </Chip>
                          )}
                        </div>
                        <span className="text-xs text-default-400 font-mono flex-shrink-0">
                          {meta?.internalIP}
                        </span>
                      </div>

                      {osArch && (
                        <span className="text-xs text-default-400 pl-4">
                          {osArch}
                        </span>
                      )}

                      {usage && (
                        <div className="flex flex-col gap-1 pt-0.5">
                          <Progress
                            size="sm"
                            value={usage.cpu.percent}
                            color={usageColor(usage.cpu.percent, "primary")}
                            label={
                              <span className="flex items-center gap-1">
                                <Cpu className="w-3 h-3" />
                                {`${formatCores(usage.cpu.used)} / ${formatCores(usage.cpu.capacity)}`}
                              </span>
                            }
                            showValueLabel
                            classNames={{ label: "text-xs", value: "text-xs" }}
                          />
                          <Progress
                            size="sm"
                            value={usage.memory.percent}
                            color={usageColor(usage.memory.percent)}
                            label={
                              <span className="flex items-center gap-1">
                                <MemoryStick className="w-3 h-3" />
                                {`${formatBytes(usage.memory.used)} / ${formatBytes(usage.memory.capacity)}`}
                              </span>
                            }
                            showValueLabel
                            classNames={{ label: "text-xs", value: "text-xs" }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>

        <NodeDetailModal
          isOpen={detailModal.isOpen}
          onOpenChange={detailModal.onOpenChange}
          node={selected}
        />
      </>
    );
  },
);

export default NodesModal;
