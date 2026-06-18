import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";

import {
  KubeResource,
  ResourceStatus,
  Tree,
} from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import Widget from "./Widget";
import {
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Skeleton,
  useDisclosure,
} from "@heroui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import ResourceRow from "../resource-row/ResourceRow";
import { statusChipColor } from "../../shared/helpers";

type ResourceCountWidgetProps = {
  resource?: KubeResource;
  skipGrandChildren?: boolean;
  compact?: boolean;
  // Flat mode for the detail panel: renders just a subresource-count pill and
  // the health button (which opens the modal), without the Widget card.
  bare?: boolean;
};

// All statuses a resource can carry, in the order they should surface (worst
// first, so failures lead).
const ALL_STATUSES = [
  ResourceStatus.FAILED,
  ResourceStatus.WARNING,
  ResourceStatus.PENDING,
  ResourceStatus.UNKNOWN,
  ResourceStatus.SUSPENDED,
  ResourceStatus.SUCCESS,
] as const;

const STATUS_ORDER: Record<string, number> = Object.fromEntries(
  ALL_STATUSES.map((s, i) => [s, i]),
);

const STATUS_LABEL: Record<string, string> = {
  [ResourceStatus.FAILED]: "Failed",
  [ResourceStatus.WARNING]: "Warning",
  [ResourceStatus.PENDING]: "Reconciling",
  [ResourceStatus.UNKNOWN]: "Unknown",
  [ResourceStatus.SUSPENDED]: "Suspended",
  [ResourceStatus.SUCCESS]: "Ready",
};

const ResourceCountWidget: React.FC<ResourceCountWidgetProps> = observer(
  ({
    resource,
    skipGrandChildren = false,
    compact,
    bare,
  }: ResourceCountWidgetProps) => {
    const store = useInjection(FluxTreeStore);
    const tree: Tree = store.tree;

    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const [allResources, setAllResources] = useState<KubeResource[]>([]);
    const [activeStatuses, setActiveStatuses] = useState<Set<string>>(
      new Set([ResourceStatus.FAILED]),
    );
    const [query, setQuery] = useState("");
    const [resourceCounts, setResourceCounts] = useState({
      total: 0,
      ready: 0,
      notReady: 0,
      suspended: 0,
      unknown: 0,
    });

    const allResourcesRef = useRef<KubeResource[]>([]);
    allResourcesRef.current = allResources;
    const [frozenResources, setFrozenResources] = useState<KubeResource[]>([]);

    useEffect(() => {
      if (!resource) return;

      const visited = new Set<string>();
      const collected: KubeResource[] = [];

      const countResources = (
        node: KubeResource | null,
        depth = 0,
      ): {
        total: number;
        ready: number;
        notReady: number;
        suspended: number;
        unknown: number;
      } => {
        if (!node || visited.has(node.uid))
          return { total: 0, ready: 0, notReady: 0, suspended: 0, unknown: 0 };
        visited.add(node.uid);
        collected.push(node);

        let total = 1;
        let ready = node.status === ResourceStatus.SUCCESS ? 1 : 0;
        let suspended = node.status === ResourceStatus.SUSPENDED ? 1 : 0;
        let unknown = node.status === ResourceStatus.UNKNOWN ? 1 : 0;
        let notReady =
          node.status !== ResourceStatus.SUCCESS &&
          node.status !== ResourceStatus.UNKNOWN &&
          node.status !== ResourceStatus.SUSPENDED
            ? 1
            : 0;

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
            suspended += c.suspended;
            unknown += c.unknown;
          }
        }

        return { total, ready, notReady, suspended, unknown };
      };

      const counts = countResources(resource);
      setResourceCounts(counts);
      setAllResources(collected);
    }, [resource, tree, skipGrandChildren]);

    const sortedResources = useMemo(
      () =>
        [...frozenResources].sort(
          (a, b) =>
            (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
        ),
      [frozenResources],
    );

    // Only show status chips for statuses actually present.
    const presentStatuses = useMemo(
      () =>
        ALL_STATUSES.filter((s) => sortedResources.some((r) => r.status === s)),
      [sortedResources],
    );

    const filteredResources = useMemo(() => {
      const q = query.trim().toLowerCase();
      return sortedResources.filter((r) => {
        if (activeStatuses.size > 0 && !activeStatuses.has(r.status))
          return false;
        if (
          q &&
          !r.name.toLowerCase().includes(q) &&
          !r.kind.toLowerCase().includes(q) &&
          !(r.namespace?.toLowerCase().includes(q) ?? false)
        )
          return false;
        return true;
      });
    }, [sortedResources, activeStatuses, query]);

    const toggleStatus = (status: string) =>
      setActiveStatuses((prev) => {
        const next = new Set(prev);
        if (next.has(status)) next.delete(status);
        else next.add(status);
        return next;
      });

    // Fixed-height rows: total size is always count × ROW_HEIGHT, so the scroll
    // range shrinks correctly when filtering and rows never overlap.
    const ROW_HEIGHT = 56;
    const scrollRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
      count: filteredResources.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: 12,
      getItemKey: (index) => filteredResources[index]?.uid ?? index,
    });

    // Jump back to the top whenever the visible set changes.
    useEffect(() => {
      virtualizer.scrollToOffset(0);
    }, [filteredResources, virtualizer]);

    // reset filters back to the Failed default when modal closes
    const handleOpenChange = () => {
      setActiveStatuses(new Set([ResourceStatus.FAILED]));
      setQuery("");
      onOpenChange();
    };

    if (!resource) {
      return (
        <Skeleton className="rounded-lg">
          <div className="h-24 rounded-lg bg-default-300" />
        </Skeleton>
      );
    }

    // Card health is driven by the live resource set, not the modal snapshot,
    // so the badge keeps reflecting the current cluster state.
    const failedCount = allResources.filter(
      (r) => r.status === ResourceStatus.FAILED,
    ).length;
    const pendingCount = allResources.filter(
      (r) =>
        r.status === ResourceStatus.PENDING ||
        r.status === ResourceStatus.WARNING,
    ).length;

    // Overall health: red if anything failed, yellow if anything is still
    // reconciling/warning, otherwise green.
    const health: "danger" | "warning" | "success" =
      failedCount > 0 ? "danger" : pendingCount > 0 ? "warning" : "success";

    const HEALTH_STYLES = {
      danger: {
        border: "border-danger/30",
        bg: "bg-danger/[0.06] hover:bg-danger/10",
        text: "text-danger",
        muted: "text-danger/60",
      },
      warning: {
        border: "border-warning/30",
        bg: "bg-warning/[0.06] hover:bg-warning/10",
        text: "text-warning",
        muted: "text-warning/60",
      },
      success: {
        border: "border-success/30",
        bg: "bg-success/[0.06] hover:bg-success/10",
        text: "text-success",
        muted: "text-success/60",
      },
    }[health];

    const healthLabel =
      failedCount > 0
        ? `${failedCount} failed${pendingCount > 0 ? ` · ${pendingCount} reconciling` : ""}`
        : pendingCount > 0
          ? `${pendingCount} reconciling`
          : "All ready";

    // Open the modal pre-filtered to the worst tier present.
    const openModal = () => {
      const seed =
        failedCount > 0
          ? new Set([ResourceStatus.FAILED])
          : pendingCount > 0
            ? new Set([ResourceStatus.PENDING, ResourceStatus.WARNING])
            : new Set<string>();
      setFrozenResources(allResourcesRef.current);
      setActiveStatuses(seed);
      setQuery("");
      onOpen();
    };

    const healthButton = (
      <button
        onClick={openModal}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border ${HEALTH_STYLES.border} ${HEALTH_STYLES.bg} transition-colors text-left`}
      >
        {health === "success" ? (
          <CheckCircle2 className={`w-3.5 h-3.5 ${HEALTH_STYLES.text} flex-shrink-0`} />
        ) : (
          <AlertTriangle className={`w-3.5 h-3.5 ${HEALTH_STYLES.text} flex-shrink-0`} />
        )}
        <span className={`text-xs flex-1 ${HEALTH_STYLES.text}`}>{healthLabel}</span>
        <span className={`text-xs ${HEALTH_STYLES.muted}`}>View →</span>
      </button>
    );

    const modal = (
      <Modal
          isOpen={isOpen}
          onOpenChange={handleOpenChange}
          size="2xl"
          className="dark"
        >
          <ModalContent>
            {() => (
              <>
                <ModalHeader className="flex items-center gap-2">
                  Resources
                  <span className="text-sm font-normal text-default-400 ml-1">
                    ({filteredResources.length}
                    {filteredResources.length !== sortedResources.length
                      ? ` / ${sortedResources.length}`
                      : ""}
                    )
                  </span>
                </ModalHeader>
                <ModalBody className="px-0 py-0 gap-0">
                  {/* Filters */}
                  <div className="flex flex-col gap-2 px-4 py-3 border-b border-default-100">
                    <Input
                      size="sm"
                      placeholder="Filter resources…"
                      value={query}
                      onValueChange={setQuery}
                      startContent={
                        <Search className="w-3.5 h-3.5 text-default-400" />
                      }
                      isClearable
                      onClear={() => setQuery("")}
                    />
                    {presentStatuses.length > 1 && (
                      <div className="flex flex-wrap gap-1.5">
                        {presentStatuses.map((status) => {
                          const active = activeStatuses.has(status);
                          return (
                            <Chip
                              key={status}
                              size="sm"
                              variant={active ? "solid" : "flat"}
                              color={statusChipColor(status)}
                              className="cursor-pointer"
                              onClick={() => toggleStatus(status)}
                            >
                              {STATUS_LABEL[status] ?? status}
                            </Chip>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* List */}
                  {filteredResources.length === 0 ? (
                    <div className="text-center text-default-400 text-sm py-10">
                      No resources.
                    </div>
                  ) : (
                    <div
                      ref={scrollRef}
                      className="overflow-y-auto"
                      style={{ height: "60vh" }}
                    >
                      <div
                        style={{
                          height: `${virtualizer.getTotalSize()}px`,
                          position: "relative",
                          width: "100%",
                        }}
                      >
                        {virtualizer.getVirtualItems().map((vItem) => {
                          const res = filteredResources[vItem.index];
                          return (
                            <div
                              key={vItem.key}
                              className="absolute top-0 left-0 w-full border-b border-default-100 overflow-hidden"
                              style={{
                                height: `${ROW_HEIGHT}px`,
                                transform: `translateY(${vItem.start}px)`,
                              }}
                            >
                              <ResourceRow
                                resource={res}
                                className="rounded-none px-4 h-full"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </ModalBody>
              </>
            )}
          </ModalContent>
        </Modal>
    );

    if (bare) {
      return (
        <div className="space-y-2">
          <Chip size="sm" variant="flat">
            {resourceCounts.total} subresources
          </Chip>
          {healthButton}
          {modal}
        </div>
      );
    }

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
            <span className="text-default-400">Suspended</span>
            <span className="text-default-400 font-medium">{resourceCounts.suspended}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-default-400">Unknown</span>
            <span className="text-default-500 font-medium">{resourceCounts.unknown}</span>
          </div>
        </div>

        {!compact && <div className="mt-3">{healthButton}</div>}

        {modal}
      </Widget>
    );
  },
);

export default ResourceCountWidget;
