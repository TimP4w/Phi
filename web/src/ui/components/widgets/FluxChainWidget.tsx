import { observer } from "mobx-react-lite";

import { KubeResource } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import { Skeleton } from "@heroui/react";
import StatusChip from "../status-chip/StatusChip";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import AppLogo from "../resource-icon/ResourceIcon";
import { MoveDown } from "lucide-react";

type FluxChainWidgetProps = {
  resource?: KubeResource;
};

const FluxChainWidget: React.FC<FluxChainWidgetProps> = observer(
  ({ resource }: FluxChainWidgetProps) => {
    const fluxTreeStore = useInjection(FluxTreeStore);

    const fullChain = fluxTreeStore.findFluxParents(resource?.uid);

    if (!resource) {
      return (
        <Skeleton className="rounded-lg">
          <div className="h-24 rounded-lg bg-default-300" />
        </Skeleton>
      );
    }

    return (
      <Widget
        span={1}
        title="Dependency Chain"
        subtitle="Chain of FluxCD resources that created this resource"
      >
        <div className="space-y-2 text-sm max-h-[240px]">
          {fullChain.map((res) => (
            <div className="flex flex-col justify-center items-center gap-2">
              <div className="flex w-full flex-col border rounded-md p-2 border-default-200">
                <div className="flex flex-row gap-3 items-center">
                  <AppLogo kind={res?.kind} />
                  <span className="text-sm font-bold">{res?.name}</span>
                  <StatusChip resource={res} />
                </div>
                <span className="text-default-400">
                  {res?.kind} • {res?.namespace}
                </span>
              </div>
              <MoveDown></MoveDown>
            </div>
          ))}
          <div className="flex flex-col justify-center items-center gap-2 pb-4">
            <div className="rounded-md p-2 border border-default-400 text-white flex items-center justify-center text-sm">
              {resource?.name}
            </div>
          </div>
        </div>
      </Widget>
    );
  }
);

export default FluxChainWidget;
