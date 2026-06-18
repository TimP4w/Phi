import { observer } from "mobx-react-lite";
import { Kustomization, KubeResource, ResourceStatus } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import { Skeleton } from "@heroui/react";
import { Link } from "react-router-dom";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useEffect, useState } from "react";
import AppLogo from "../resource-icon/ResourceIcon";
import StatusChip from "../status-chip/StatusChip";
import { ROUTES } from "../../routes/routes.enum";

type KustomizationDependsOnWidgetProps = {
  resource?: Kustomization;
  compact?: boolean;
};

const dotClass = (resource: KubeResource): string => {
  switch (resource.status) {
    case ResourceStatus.SUCCESS: return "bg-success";
    case ResourceStatus.FAILED: return "bg-danger";
    case ResourceStatus.PENDING: return "bg-primary";
    case ResourceStatus.WARNING: return "bg-warning";
    default: return "bg-default-400";
  }
};

const KustomizationDependsOnWidget: React.FC<KustomizationDependsOnWidgetProps> =
  observer(({ resource, compact }) => {
    const fluxTreeStore = useInjection(FluxTreeStore);
    const [dependencies, setDependencies] = useState<Kustomization[]>([]);

    useEffect(() => {
      if (resource?.metadata?.dependsOn) {
        const deps = resource.metadata.dependsOn
          .map((name) => fluxTreeStore.findKustomizationByName(name))
          .filter((dep): dep is Kustomization => dep !== undefined);
        setDependencies(deps);
      } else {
        setDependencies([]);
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
      <Widget span={1} title="Depends On" compact={compact}>
        {dependencies.length === 0 ? (
          <p className="text-xs text-default-400">No dependencies</p>
        ) : (
          <div>
            {dependencies.map((dep, i) => (
              <div key={dep.uid}>
                <Link
                  to={`${ROUTES.RESOURCE}/${dep.uid}`}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-default-100 text-white w-full"
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass(dep)}`} />
                  <div className="flex-shrink-0">
                    <AppLogo kind={dep.kind} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">{dep.name}</p>
                    <p className="text-xs text-default-400">{dep.kind}</p>
                  </div>
                  <StatusChip resource={dep} />
                </Link>
                {i < dependencies.length - 1 && (
                  <div className="ml-[13px] h-4 border-l border-dashed border-default-300" />
                )}
              </div>
            ))}
          </div>
        )}
      </Widget>
    );
  });

export default KustomizationDependsOnWidget;
