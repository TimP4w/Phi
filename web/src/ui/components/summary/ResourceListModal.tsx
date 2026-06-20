import { useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
} from "@heroui/react";
import { Search } from "lucide-react";
import { KubeResource } from "../../../core/fluxTree/models/tree";
import ResourceRow from "../resource-row/ResourceRow";

type Props = {
  isOpen: boolean;
  onOpenChange: () => void;
  title: string;
  resources: KubeResource[];
  emptyText?: string;
};

/** Generic, searchable list of resources rendered as ResourceRows, shared by the inspector sections. */
const ResourceListModal: React.FC<Props> = observer(
  ({ isOpen, onOpenChange, title, resources, emptyText = "Nothing here." }) => {
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      const sorted = [...resources].sort((a, b) =>
        a.kind === b.kind
          ? a.name.localeCompare(b.name)
          : a.kind.localeCompare(b.kind),
      );
      if (!q) return sorted;
      return sorted.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.kind.toLowerCase().includes(q) ||
          (r.namespace?.toLowerCase().includes(q) ?? false),
      );
    }, [resources, query]);

    return (
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="2xl"
        scrollBehavior="inside"
        className="dark"
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            {title}
            <span className="text-sm font-normal text-default-400">
              ({filtered.length})
            </span>
          </ModalHeader>
          <ModalBody className="px-0 py-0 gap-0">
            <div className="px-4 py-3 border-b border-default-100">
              <Input
                size="sm"
                placeholder="Filter…"
                value={query}
                onValueChange={setQuery}
                startContent={<Search className="w-3.5 h-3.5 text-default-400" />}
                isClearable
                onClear={() => setQuery("")}
              />
            </div>
            {filtered.length === 0 ? (
              <div className="text-center text-default-400 text-sm py-10">
                {emptyText}
              </div>
            ) : (
              <div className="overflow-y-auto py-2 px-2" style={{ maxHeight: "60vh" }}>
                {filtered.map((r) => (
                  <ResourceRow key={r.uid} resource={r} />
                ))}
              </div>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    );
  },
);

export default ResourceListModal;
