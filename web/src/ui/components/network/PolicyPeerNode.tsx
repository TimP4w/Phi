import { Handle, NodeProps, Node, Position } from "@xyflow/react";
import { ShieldCheck, Info } from "lucide-react";
import { Popover } from "@heroui/react";
import { NetworkNodeData } from "../../../core/network/usecases/NetworkTopology.usecase";

// Synthetic node for a NetworkPolicy peer that isn't a concrete pod (CIDR, selector, or "Anywhere").
function PolicyPeerNode({ data }: NodeProps<Node<NetworkNodeData>>) {
  const d = data as { label?: string; names?: string[] };
  const label = d.label ?? "";
  const subtitle = d.names?.[0] ?? "Policy peer";
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} />
      <div className="w-[240px] bg-surface-secondary border border-segment rounded-lg shadow-sm">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <ShieldCheck className="w-5 h-5 flex-shrink-0 text-muted" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">{label}</p>
            <p className="text-xs text-muted leading-tight mt-0.5">{subtitle}</p>
          </div>
          <Popover>
            <Popover.Trigger>
              <button
                aria-label="Peer details"
                
                className="flex-shrink-0 text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <Info className="w-4 h-4" />
              </button>
            </Popover.Trigger>
            <Popover.Content
              placement="top"
              className="rounded-lg border-small border-default-100 shadow-xl"
            >
              <div className="px-3 py-2.5 text-xs space-y-1 max-w-[320px]">
                <p className="text-sm font-semibold">{subtitle}</p>
                <p className="break-words font-mono">{label}</p>
              </div>
            </Popover.Content>
          </Popover>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default PolicyPeerNode;
