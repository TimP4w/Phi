import { NodeProps, Node } from "@xyflow/react";
import { Network } from "lucide-react";
import { NetworkNodeData } from "../../../core/network/usecases/NetworkTopology.usecase";
import SyntheticNode from "./SyntheticNode";

// Synthetic node for an external/LoadBalancer IP address.
function ExternalIpNode({ data }: NodeProps<Node<NetworkNodeData>>) {
  const label = (data as { label?: string }).label ?? "";
  return <SyntheticNode label={label} subtitle="External IP" icon={Network} />;
}

export default ExternalIpNode;
