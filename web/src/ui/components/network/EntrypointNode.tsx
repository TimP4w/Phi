import { NodeProps, Node } from "@xyflow/react";
import { DoorOpen } from "lucide-react";
import { NetworkNodeData } from "../../../core/network/usecases/NetworkTopology.usecase";
import SyntheticNode from "./SyntheticNode";

// Synthetic node for a proxy entrypoint / named listener (controller-defined,
// e.g. a Traefik entrypoint or a Gateway listener). Rendered as-is from its name;
// no assumptions are made about what a given name means.
function EntrypointNode({ data }: NodeProps<Node<NetworkNodeData>>) {
  const label = (data as { label?: string }).label ?? "";
  return <SyntheticNode label={label} subtitle="Entrypoint" icon={DoorOpen} />;
}

export default EntrypointNode;
