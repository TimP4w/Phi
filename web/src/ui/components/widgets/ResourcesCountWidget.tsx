import { observer } from "mobx-react-lite";

import { KubeResource, ResourceStatus } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Skeleton,
  useDisclosure,
} from "@heroui/react";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import ResourceRow from "../resource-row/ResourceRow";

type ResourceCountWidgetProps = {
  resource?: KubeResource;
  skipGrandChildren?: boolean;
  compact?: boolean;
};

function reconcilingLabel(resources: KubeResource[]): string {
  const names = resources.map((r) => r.name);
  if (names.length === 1) return `${names[0]} is reconciling`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are reconciling`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} other${names.length - 2 === 1 ? "" : "s"} are reconciling`;
}

const ResourceCountWidget: React.FC<ResourceCountWidgetProps> = observer(
  ({ resource, skipGrandChildren = false, compact }: ResourceCountWidgetProps) => {
    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const [criticalResources, setCriticalResources] = useState<KubeResource[]>([]);
    const [reconcilingResources, setReconcilingResources] = useState<KubeResource[]>([]);
    const [showReconciling, setShowReconciling] = useState(false);
    const [resourceCounts, setResourceCounts] = useState({
      total: 0,
      ready: 0,
      notReady: 0,
      unknown: 0,
    });

    useEffect(() => {
      if (!resource) return;

      const seenUids = new Set<string>();
      const newCritical: KubeResource[] = [];
      const newReconciling: KubeResource[] = [];

      const countResources = (
        node: KubeResource | null,
        depth = 0
      ): { total: number; ready: number; notReady: number; unknown: number } => {
        if (!node) return { total: 0, ready: 0, notReady: 0, unknown: 0 };

        let total = 1;
        let ready = node.status === ResourceStatus.SUCCESS ? 1 : 0;
        let notReady =
          node.status !== ResourceStatus.SUCCESS && node.status !== ResourceStatus.UNKNOWN ? 1 : 0;
        let unknown = node.status === ResourceStatus.UNKNOWN ? 1 : 0;

        if (notReady === 1 && !seenUids.has(node.uid)) {
          seenUids.add(node.uid);
          if (node.status === ResourceStatus.PENDING) {
            newReconciling.push(node);
          } else {
            newCritical.push(node);
          }
        }

        const skipChildren =
          depth > 0 &&
          (node.kind === RESOURCE_TYPE.KUSTOMIZATION ||
            node.kind === RESOURCE_TYPE.HELM_RELEASE) &&
          skipGrandChildren;

        if (!skipChildren) {
          for (const child of node.children || []) {
            const c = countResources(child, depth + 1);
            total += c.total;
            ready += c.ready;
            notReady += c.notReady;
            unknown += c.unknown;
          }
        }

        return { total, ready, notReady, unknown };
      };

      setResourceCounts(countResources(resource));
      setCriticalResources(newCritical);
      setReconcilingResources(newReconciling);
    }, [resource, skipGrandChildren]);

    // reset collapsed state when modal closes
    const handleOpenChange = () => {
      setShowReconciling(false);
      onOpenChange();
    };

    if (!resource) {
      return (
        <Skeleton className="rounded-lg">
          <div className="h-24 rounded-lg bg-default-300" />
        </Skeleton>
      );
    }

    const totalNotReady = criticalResources.length + reconcilingResources.length;

    return (
      <Widget span={1} title="Resources" subtitle="Status of all resources" compact={compact}>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-default-400">Total</span>
            <span className="text-foreground font-medium">{resourceCounts.total}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-default-400">Ready</span>
            <span className="text-success font-medium">{resourceCounts.ready}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-default-400">Not Ready</span>
            <span className="text-danger font-medium">{resourceCounts.notReady}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-default-400">Unknown</span>
            <span className="text-default-500 font-medium">{resourceCounts.unknown}</span>
          </div>
        </div>

        {!compact && totalNotReady > 0 && (
          <button
            onClick={onOpen}
            className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-danger/30 bg-danger/[0.06] hover:bg-danger/10 transition-colors text-left"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-danger flex-shrink-0" />
            <span className="text-xs text-danger flex-1">
              {criticalResources.length > 0
                ? `${criticalResources.length} not ready`
                : `${reconcilingResources.length} reconciling`}
              {criticalResources.length > 0 && reconcilingResources.length > 0 && (
                <span className="text-danger/60"> · {reconcilingResources.length} reconciling</span>
              )}
            </span>
            <span className="text-xs text-danger/60">View →</span>
          </button>
        )}

        <Modal
          isOpen={isOpen}
          onOpenChange={handleOpenChange}
          scrollBehavior="inside"
          size="2xl"
          className="dark"
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger" />
                  Not Ready Resources
                  <span className="text-sm font-normal text-default-400 ml-1">
                    ({totalNotReady})
                  </span>
                </ModalHeader>
                <ModalBody className="px-0 py-0">
                  {/* Critical resources — failed / warning */}
                  {criticalResources.length > 0 && (
                    <div className="divide-y divide-default-100">
                      {criticalResources.map((res) => (
                        <ResourceRow key={res.uid} resource={res} className="rounded-none px-4" />
                      ))}
                    </div>
                  )}

                  {/* Reconciling — collapsed by default */}
                  {reconcilingResources.length > 0 && (
                    <div className={criticalResources.length > 0 ? "border-t border-default-100" : ""}>
                      <button
                        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-content2 transition-colors text-left"
                        onClick={() => setShowReconciling((v) => !v)}
                      >
                        <Loader2 className="w-3.5 h-3.5 text-warning flex-shrink-0 animate-spin" />
                        <span className="text-xs text-default-400 flex-1 truncate">
                          {reconcilingLabel(reconcilingResources)}
                        </span>
                        {showReconciling ? (
                          <ChevronDown className="w-3.5 h-3.5 text-default-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-default-400 flex-shrink-0" />
                        )}
                      </button>
                      {showReconciling && (
                        <div className="divide-y divide-default-100 border-t border-default-100">
                          {reconcilingResources.map((res) => (
                            <ResourceRow key={res.uid} resource={res} className="rounded-none px-4" />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </ModalBody>
                <ModalFooter>
                  <Button color="default" variant="light" onPress={onClose}>
                    Close
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      </Widget>
    );
  }
);

export default ResourceCountWidget;
