import { Handle, NodeProps, Node, Position } from "@xyflow/react";
import { ShieldCheck, Info } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/react";
import { NetworkNodeData } from "../../../core/network/usecases/NetworkTopology.usecase";

// Synthetic node for a NetworkPolicy peer that isn't a concrete pod (CIDR, selector, or "Anywhere").
function PolicyPeerNode({ data }: NodeProps<Node<NetworkNodeData>>) {
  const d = data as { label?: string; names?: string[] };
  const label = d.label ?? "";
  const subtitle = d.names?.[0] ?? "Policy peer";
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} />
      <div className="w-[240px] bg-content2 border border-default-300 rounded-lg shadow-sm">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <ShieldCheck className="w-5 h-5 flex-shrink-0 text-default-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">{label}</p>
            <p className="text-xs text-default-500 leading-tight mt-0.5">{subtitle}</p>
          </div>
          <Popover placement="top" showArrow>
            <PopoverTrigger>
              <button
                aria-label="Peer details"
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 text-default-400 hover:text-default-200 transition-colors cursor-pointer"
              >
                <Info className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent>
              <div className="px-1 py-2 text-xs space-y-1 max-w-[320px]">
                <p className="text-sm font-semibold">{subtitle}</p>
                <p className="break-words font-mono">{label}</p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default PolicyPeerNode;
