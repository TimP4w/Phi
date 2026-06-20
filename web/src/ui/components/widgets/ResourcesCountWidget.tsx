import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";

import {
  KubeResource,
  ResourceStatus,
  Tree,
  walkSubtree,
} from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import Widget from "./Widget";
import {
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalHeader,
  Skeleton,
  useOverlayState,
} from "@heroui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import {
  FLUX_KINDS,
  RESOURCE_TYPE,
} from "../../../core/fluxTree/constants/resources.const";
import HealthButton from "../summary/HealthButton";
import ResourceRow from "../resource-row/ResourceRow";
import { statusChipColor } from "../../shared/helpers";

type ResourceCountWidgetProps = {
  resource?: KubeResource;
  skipGrandChildren?: boolean;
  compact?: boolean;
  // Flat mode for the detail panel: renders a "{count} {title}" heading and the health button (which opens the modal), without the Widget card.
  bare?: boolean;
  // Heading label for bare mode, e.g. "Subresources" → "27 Subresources".
  title?: string;
  // Kinds to skip when counting/listing (their children are still walked). Defaults to the Flux kinds, so "Resources" means everything non-Flux (Flux objects have their own Reconciliation section); pass an empty set to count everything.
  excludeKinds?: Set<string>;
};

// Flux objects are surfaced via Reconciliation, not the resource count.
const FLUX_KIND_SET = new Set<string>(FLUX_KINDS);

// All statuses a resource can carry, in the order they should surface (worst first, so failures lead).
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
    title,
    excludeKinds = FLUX_KIND_SET,
  }: ResourceCountWidgetProps) => {
    const store = useInjection(FluxTreeStore);
    const tree: Tree = store.tree;

    const { isOpen, open: onOpen, setOpen: onOpenChange } = useOverlayState();
    const [activeStatuses, setActiveStatuses] = useState<Set<string>>(
      new Set([ResourceStatus.FAILED]),
    );
    const [query, setQuery] = useState("");
    const [frozenResources, setFrozenResources] = useState<KubeResource[]>([]);

    const { resourceCounts, allResources } = useMemo(() => {
      const counts = { total: 0, ready: 0, notReady: 0, suspended: 0, unknown: 0 };
      const collected: KubeResource[] = [];
      if (resource) {
        walkSubtree(resource, (node, depth) => {
          // Excluded kinds (e.g. Flux objects) don't count, but their children do.
          const excluded = excludeKinds?.has(node.kind) ?? false;
          if (!excluded) {
            collected.push(node);
            counts.total++;
            if (node.status === ResourceStatus.SUCCESS) counts.ready++;
            else if (node.status === ResourceStatus.SUSPENDED) counts.suspended++;
            else if (node.status === ResourceStatus.UNKNOWN) counts.unknown++;
            else counts.notReady++;
          }
          // Never prune at an excluded node: walk through it to reach countable descendants.
          return (
            !excluded &&
            depth > 0 &&
            (node.kind === RESOURCE_TYPE.KUSTOMIZATION ||
              node.kind === RESOURCE_TYPE.HELM_RELEASE) &&
            skipGrandChildren
          );
        });
      }
      return { resourceCounts: counts, allResources: collected };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resource, tree, skipGrandChildren, excludeKinds]);

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

    // Fixed-height rows: total size is always count × ROW_HEIGHT, so the scroll range shrinks correctly when filtering and rows never overlap.
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
      onOpenChange(false);
    };

    if (!resource) {
      return (
        <Skeleton className="rounded-lg">
          <div className="h-24 rounded-lg bg-segment" />
        </Skeleton>
      );
    }

    // Card health is driven by the live resource set, not the modal snapshot, so the badge keeps reflecting the current cluster state.
    const failedCount = allResources.filter(
      (r) => r.status === ResourceStatus.FAILED,
    ).length;
    const pendingCount = allResources.filter(
      (r) =>
        r.status === ResourceStatus.PENDING ||
        r.status === ResourceStatus.WARNING,
    ).length;

    // Overall health: red if anything failed, yellow if anything is still reconciling/warning, otherwise green.
    const health: "danger" | "warning" | "success" =
      failedCount > 0 ? "danger" : pendingCount > 0 ? "warning" : "success";

    const healthLabel =
      failedCount > 0
        ? `${failedCount} failed${pendingCount > 0 ? ` · ${pendingCount} reconciling` : ""}`
        : pendingCount > 0
          ? `${pendingCount} reconciling`
          : `${resourceCounts.total} ready`;

    // Open the modal pre-filtered to the worst tier present.
    const openModal = () => {
      const seed =
        failedCount > 0
          ? new Set([ResourceStatus.FAILED])
          : pendingCount > 0
            ? new Set([ResourceStatus.PENDING, ResourceStatus.WARNING])
            : new Set<string>();
      setFrozenResources(allResources);
      setActiveStatuses(seed);
      setQuery("");
      onOpen();
    };

    const healthButton = (
      <HealthButton tone={health} label={healthLabel} onClick={openModal} />
    );

    const modal = (
      <Modal.Backdrop isOpen={isOpen} onOpenChange={handleOpenChange}>
        <Modal.Container size="lg">
          <Modal.Dialog className="!max-w-3xl w-full">
            <Modal.CloseTrigger className="absolute right-3 top-3 z-10" />
            <ModalHeader className="flex items-center gap-2">
              Resources
              <span className="text-sm font-normal text-muted ml-1">
                ({filteredResources.length}
                {filteredResources.length !== sortedResources.length
                  ? ` / ${sortedResources.length}`
                  : ""}
                )
              </span>
            </ModalHeader>
            <ModalBody className="px-0 py-0 gap-0">
              {/* Filters */}
              <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
                <div className="relative w-full">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
                  <Input
                    className="pl-8"
                    placeholder="Filter resources…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                {presentStatuses.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {presentStatuses.map((status) => {
                      const active = activeStatuses.has(status);
                      return (
                        <Chip
                          key={status}
                          size="sm"
                          variant={active ? "primary" : "soft"}
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
                <div className="text-center text-muted text-sm py-10">
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
                          className="absolute top-0 left-0 w-full border-b border-border overflow-hidden"
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
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    );

    if (bare) {
      return (
        <div className="space-y-2">
          {title && (
            <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2 px-2">
              {resourceCounts.total} {title}
            </p>
          )}
          {healthButton}
          {modal}
        </div>
      );
    }

    return (
      <Widget
        span={1}
        title="Resources"
        subtitle="Status of all resources"
        compact={compact}
      >
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted">Total</span>
            <span className="text-foreground font-medium">
              {resourceCounts.total}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted">Ready</span>
            <span className="text-success font-medium">
              {resourceCounts.ready}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted">Not Ready</span>
            <span className="text-danger font-medium">
              {resourceCounts.notReady}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted">Suspended</span>
            <span className="text-muted font-medium">
              {resourceCounts.suspended}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted">Unknown</span>
            <span className="text-muted font-medium">
              {resourceCounts.unknown}
            </span>
          </div>
        </div>

        {!compact && <div className="mt-3">{healthButton}</div>}

        {modal}
      </Widget>
    );
  },
);

export default ResourceCountWidget;
