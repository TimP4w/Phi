import { Handle, NodeProps, Position, Node } from "@xyflow/react";
import { DoorOpen } from "lucide-react";
import { NetworkNodeData } from "../../../core/network/usecases/NetworkTopology.usecase";

// Synthetic node for a proxy entrypoint / named listener (controller-defined,
// e.g. a Traefik entrypoint or a Gateway listener). Rendered as-is from its name;
// no assumptions are made about what a given name means.
function EntrypointNode({ data }: NodeProps<Node<NetworkNodeData>>) {
  const label = (data as { label?: string }).label ?? "";
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} />
      <div className="w-[240px] bg-content2 border border-default-300 rounded-lg shadow-sm">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <DoorOpen className="w-5 h-5 flex-shrink-0 text-default-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">{label}</p>
            <p className="text-xs text-default-500 leading-tight mt-0.5">Entrypoint</p>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default EntrypointNode;
