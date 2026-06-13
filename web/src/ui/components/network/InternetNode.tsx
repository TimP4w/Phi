import { Handle, Position } from "@xyflow/react";
import { Globe } from "lucide-react";

// Synthetic source node representing inbound traffic from outside the cluster.
function InternetNode() {
  return (
    <div className="relative">
      <div className="w-[240px] bg-content2 border border-default-300 border-dashed rounded-lg shadow-sm">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="flex-shrink-0 text-default-500">
            <Globe className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">Internet</p>
            <p className="text-xs text-default-500 leading-tight mt-0.5">
              External traffic
            </p>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default InternetNode;
