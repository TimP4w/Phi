import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Chip, Input, Modal, ModalBody, ModalHeader } from "@heroui/react";
import { Search } from "lucide-react";
import {
  KubeResource,
  ResourceStatus,
} from "../../../core/fluxTree/models/tree";
import ResourceRow from "../resource-row/ResourceRow";
import { statusChipColor } from "../../shared/helpers";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  resources: KubeResource[];
  emptyText?: string;
  // When set, the list opens filtered to these statuses and exposes chips to toggle them.
  defaultStatuses?: Set<string>;
};

// Statuses in surfacing order — failures lead, ready trails.
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

/** Generic, searchable list of resources rendered as ResourceRows, shared by the inspector sections. */
const ResourceListModal: React.FC<Props> = observer(
  ({
    isOpen,
    onOpenChange,
    title,
    resources,
    emptyText = "Nothing here.",
    defaultStatuses,
  }) => {
    const [query, setQuery] = useState("");
    const [activeStatuses, setActiveStatuses] = useState<Set<string>>(
      () => new Set(defaultStatuses),
    );

    // These modals stay mounted, so the seed has to be (re)applied each time the modal
    // opens — the failed/reconciling counts often aren't known yet at first render.
    const seedKey = defaultStatuses
      ? [...defaultStatuses].sort().join(",")
      : "";
    useEffect(() => {
      if (!isOpen) return;
      setQuery("");
      setActiveStatuses(new Set(seedKey ? seedKey.split(",") : []));
    }, [isOpen, seedKey]);

    const sorted = useMemo(
      () =>
        [...resources].sort((a, b) => {
          const byStatus =
            (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
          if (byStatus !== 0) return byStatus;
          return a.kind === b.kind
            ? a.name.localeCompare(b.name)
            : a.kind.localeCompare(b.kind);
        }),
      [resources],
    );

    // Only offer chips for statuses actually present, and only when there's a choice to make.
    const presentStatuses = useMemo(
      () => ALL_STATUSES.filter((s) => sorted.some((r) => r.status === s)),
      [sorted],
    );

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      return sorted.filter((r) => {
        if (activeStatuses.size > 0 && !activeStatuses.has(r.status))
          return false;
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          r.kind.toLowerCase().includes(q) ||
          (r.namespace?.toLowerCase().includes(q) ?? false)
        );
      });
    }, [sorted, activeStatuses, query]);

    const toggleStatus = (status: string) =>
      setActiveStatuses((prev) => {
        const next = new Set(prev);
        if (next.has(status)) next.delete(status);
        else next.add(status);
        return next;
      });

    return (
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container size="lg">
          <Modal.Dialog className="!max-w-3xl w-full">
            <Modal.CloseTrigger className="absolute right-3 top-3 z-10" />
            <ModalHeader className="flex items-center gap-2">
              {title}
              <span className="text-sm font-normal text-muted">
                ({filtered.length}
                {filtered.length !== sorted.length ? ` / ${sorted.length}` : ""}
                )
              </span>
            </ModalHeader>
            <ModalBody className="px-0 py-0 gap-0">
              <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
                <div className="relative w-full">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
                  <Input
                    className="pl-8"
                    placeholder="Filter…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                {presentStatuses.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {presentStatuses.map((status) => (
                      <Chip
                        key={status}
                        size="sm"
                        variant={
                          activeStatuses.has(status) ? "primary" : "soft"
                        }
                        color={statusChipColor(status)}
                        className="cursor-pointer"
                        onClick={() => toggleStatus(status)}
                      >
                        {STATUS_LABEL[status] ?? status}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
              {filtered.length === 0 ? (
                <div className="text-center text-muted text-sm py-10">
                  {emptyText}
                </div>
              ) : (
                <div
                  className="overflow-y-auto py-2 px-2"
                  style={{ maxHeight: "60vh" }}
                >
                  {filtered.map((r) => (
                    <ResourceRow key={r.uid} resource={r} />
                  ))}
                </div>
              )}
            </ModalBody>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    );
  },
);

export default ResourceListModal;
