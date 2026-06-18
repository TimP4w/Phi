import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router-dom";
import {
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
} from "@heroui/react";
import { ExternalLink, Search } from "lucide-react";
import { LonghornVolume } from "../../../core/fluxTree/models/tree";
import { formatBytes } from "../../shared/format";
import { ROUTES } from "../../routes/routes.enum";

const ROBUSTNESS = ["healthy", "degraded", "faulted"] as const;
type Robustness = (typeof ROBUSTNESS)[number];

function robustnessChipColor(
  robustness: string,
): "success" | "warning" | "danger" | "default" {
  switch (robustness) {
    case "healthy":
      return "success";
    case "degraded":
      return "warning";
    case "faulted":
      return "danger";
    default:
      return "default";
  }
}

type Props = {
  isOpen: boolean;
  onOpenChange: () => void;
  volumes: LonghornVolume[];
  initialFilter?: Robustness;
};

const LonghornVolumesModal: React.FC<Props> = observer(
  ({ isOpen, onOpenChange, volumes, initialFilter }) => {
    const navigate = useNavigate();

    const [activeRobustness, setActiveRobustness] = useState<Set<string>>(
      new Set(),
    );
    const [query, setQuery] = useState("");

    const volumesRef = useRef(volumes);
    volumesRef.current = volumes;
    const [frozenVolumes, setFrozenVolumes] = useState<LonghornVolume[]>([]);

    // Reset filters each time the modal opens, seeding the robustness filter
    // from the count the user clicked.
    useEffect(() => {
      if (isOpen) {
        setFrozenVolumes(volumesRef.current);
        setActiveRobustness(
          initialFilter ? new Set([initialFilter]) : new Set(),
        );
        setQuery("");
      }
    }, [isOpen, initialFilter]);

    const filteredVolumes = useMemo(() => {
      const q = query.trim().toLowerCase();
      const order: Record<string, number> = {
        faulted: 0,
        degraded: 1,
        healthy: 2,
      };
      return frozenVolumes
        .filter((v) => {
          const robustness = v.metadata?.robustness ?? "";
          if (activeRobustness.size > 0 && !activeRobustness.has(robustness))
            return false;
          if (
            q &&
            !v.name.toLowerCase().includes(q) &&
            !(v.namespace?.toLowerCase().includes(q) ?? false)
          )
            return false;
          return true;
        })
        .sort(
          (a, b) =>
            (order[a.metadata?.robustness ?? ""] ?? 9) -
            (order[b.metadata?.robustness ?? ""] ?? 9),
        );
    }, [frozenVolumes, activeRobustness, query]);

    const toggleRobustness = (robustness: string) =>
      setActiveRobustness((prev) => {
        const next = new Set(prev);
        if (next.has(robustness)) next.delete(robustness);
        else next.add(robustness);
        return next;
      });

    const openResource = (uid: string) => {
      onOpenChange();
      navigate(`${ROUTES.RESOURCE}/${uid}`);
    };

    return (
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="2xl"
        className="dark"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center gap-2">
                Longhorn Volumes
                <span className="text-sm font-normal text-default-400 ml-1">
                  ({filteredVolumes.length}
                  {filteredVolumes.length !== frozenVolumes.length
                    ? ` / ${frozenVolumes.length}`
                    : ""}
                  )
                </span>
              </ModalHeader>
              <ModalBody className="px-0 py-0 gap-0">
                {/* Filters */}
                <div className="flex flex-col gap-2 px-4 py-3 border-b border-default-100">
                  <Input
                    size="sm"
                    placeholder="Filter volumes…"
                    value={query}
                    onValueChange={setQuery}
                    startContent={
                      <Search className="w-3.5 h-3.5 text-default-400" />
                    }
                    isClearable
                    onClear={() => setQuery("")}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {ROBUSTNESS.map((robustness) => {
                      const active = activeRobustness.has(robustness);
                      return (
                        <Chip
                          key={robustness}
                          size="sm"
                          variant={active ? "solid" : "flat"}
                          color={robustnessChipColor(robustness)}
                          className="cursor-pointer capitalize"
                          onClick={() => toggleRobustness(robustness)}
                        >
                          {robustness}
                        </Chip>
                      );
                    })}
                  </div>
                </div>

                {/* List */}
                {filteredVolumes.length === 0 ? (
                  <div className="text-center text-default-400 text-sm py-10">
                    No volumes.
                  </div>
                ) : (
                  <div
                    className="overflow-y-auto"
                    style={{ maxHeight: "60vh" }}
                  >
                    {filteredVolumes.map((v) => {
                      const robustness = v.metadata?.robustness ?? "";
                      return (
                        <div
                          key={v.uid}
                          className="border-b border-default-100 overflow-hidden"
                        >
                          <div className="flex items-start gap-3 px-4 py-2.5">
                            <Chip
                              size="sm"
                              color={robustnessChipColor(robustness)}
                              variant="flat"
                              className="flex-shrink-0 capitalize"
                            >
                              {robustness || "—"}
                            </Chip>
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => openResource(v.uid)}
                                className="inline-flex items-center gap-1 text-sm font-medium text-primary-400 hover:underline max-w-full"
                              >
                                <span className="truncate">{v.name}</span>
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              </button>
                              <p className="text-xs text-default-400 truncate">
                                {[
                                  v.metadata?.state,
                                  v.metadata?.size != null &&
                                    formatBytes(v.metadata.size),
                                  v.metadata?.numberOfReplicas != null &&
                                    `${v.metadata.numberOfReplicas} replicas`,
                                  v.metadata?.nodeID,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    );
  },
);

export default LonghornVolumesModal;
