import { Handle, Position } from "@xyflow/react";
import { LucideIcon } from "lucide-react";

type SyntheticNodeProps = {
  label: string;
  subtitle: string;
  icon: LucideIcon;
};

// Shared layout for the topology's synthetic (non-Kubernetes-object) nodes that
// sit between the Internet and a real resource — e.g. an external IP or a proxy
// entrypoint. Concrete node types supply their icon and subtitle.
function SyntheticNode({ label, subtitle, icon: Icon }: SyntheticNodeProps) {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} />
      <div className="w-[240px] bg-content2 border border-default-300 rounded-lg shadow-sm">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <Icon className="w-5 h-5 flex-shrink-0 text-default-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">{label}</p>
            <p className="text-xs text-default-500 leading-tight mt-0.5">{subtitle}</p>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default SyntheticNode;
