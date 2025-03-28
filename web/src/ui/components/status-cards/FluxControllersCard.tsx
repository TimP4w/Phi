import { observer } from "mobx-react-lite";

import { Card, CardBody, CardFooter, CardHeader } from "@heroui/react";
import { TreeNode } from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import StatusCircle from "../status-circle/StatusCircle";
import { Link } from "react-router-dom";

type FluxControllersProps = object;

const FluxControllersCard: React.FC<FluxControllersProps> = observer(
  (_: FluxControllersProps) => {
    const fluxTreeStore = useInjection(FluxTreeStore);

    return (
      <Card className="w-[240px]">
        <CardHeader className="flex gap-3">
          <div className="flex flex-col">
            <p className="text-md bold">FluxCD Controllers</p>
          </div>
        </CardHeader>
        <CardBody className="flex gap-3 p-4">
          {fluxTreeStore.tree.getFluxSystemPods().map((node: TreeNode) => (
            <Link key={node.uid} to={`/tree/${node.uid}`}>
              <div className="flex gap-3 justify-between transition-transform duration-300 hover:scale-105">
                <span>{node.name}</span>
                <div className="max-w-[12px] max-h-[12px]">
                  <StatusCircle status={node.status} />
                </div>
              </div>
            </Link>
          ))}
        </CardBody>
        <CardFooter></CardFooter>
      </Card>
    );
  }
);

export default FluxControllersCard;
