import { observer } from "mobx-react-lite";

import { Kustomization } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import { Skeleton } from "@heroui/react";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useEffect, useState } from "react";
import ResourceCard from "../resource-card/ResourceCard";

type KustomizationDependsOnWidgetProps = {
  resource?: Kustomization;
};

const KustomizationDependsOnWidget: React.FC<KustomizationDependsOnWidgetProps> =
  observer(({ resource }: KustomizationDependsOnWidgetProps) => {
    const fluxTreeStore = useInjection(FluxTreeStore);

    const [dependencies, setDependencies] = useState<Kustomization[]>([]);

    useEffect(() => {
      if (resource?.metadata?.dependsOn) {
        const deps = resource.metadata.dependsOn
          .map((kustomization) =>
            fluxTreeStore.findKustomizationByName(kustomization)
          )
          .filter((dep) => dep !== undefined) as Kustomization[];
        setDependencies(deps);
      }
    }, [resource, fluxTreeStore]);

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
        title="Depends On"
        subtitle="Other Kustomizations that this Kustomization depends on"
      >
        <div className="space-y-2 text-sm max-h-[240px]">
          {(dependencies.length > 0 &&
            dependencies.map((res) => (
              <div
                className="flex flex-col gap-2 justify-between items-center"
                key={res.uid}
              >
                <ResourceCard resource={res}></ResourceCard>
              </div>
            ))) || (
            <span className="text-default-400 text-xl">No Dependency</span>
          )}
        </div>
      </Widget>
    );
  });

export default KustomizationDependsOnWidget;
