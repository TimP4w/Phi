import { Handle, NodeProps, Position, Node } from "@xyflow/react";
import { BrickWall } from "lucide-react";
import { NetworkNodeData } from "../../../core/network/usecases/NetworkTopology.usecase";

// A "wall" the traffic passes through: a single node listing the middleware names
// applied at this point (route-level or entrypoint-level). Not a firewall — just
// the ordered filters in the path.
function MiddlewareWallNode({ data }: NodeProps<Node<NetworkNodeData>>) {
  const d = data as { label?: string; names?: string[] };
  const names = d.names ?? [];
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} />
      <div className="w-[240px] bg-surface-secondary border-l-4 border-segment border-y border-r border-border rounded-md shadow-sm">
        <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
          <BrickWall className="w-4 h-4 flex-shrink-0 text-muted" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {d.label ?? "Middlewares"}
          </p>
        </div>
        <ul className="px-3 pb-2 space-y-0.5">
          {names.map((name, i) => (
            <li key={`${name}-${i}`} className="text-sm leading-tight truncate">
              {name}
            </li>
          ))}
        </ul>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default MiddlewareWallNode;
