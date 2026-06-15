import { observer } from "mobx-react-lite";
import { KubeResource, ResourceStatus } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import { Skeleton } from "@heroui/react";
import { Link } from "react-router-dom";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import AppLogo from "../resource-icon/ResourceIcon";
import StatusChip from "../status-chip/StatusChip";
import { ROUTES } from "../../routes/routes.enum";

type FluxChainWidgetProps = {
  resource?: KubeResource;
  compact?: boolean;
};

const dotClass = (resource: KubeResource): string => {
  switch (resource.status) {
    case ResourceStatus.SUCCESS:
      return "bg-success";
    case ResourceStatus.FAILED:
      return "bg-danger";
    case ResourceStatus.PENDING:
      return "bg-primary";
    case ResourceStatus.WARNING:
      return "bg-warning";
    default:
      return "bg-default-400";
  }
};

const FluxChainWidget: React.FC<FluxChainWidgetProps> = observer(
  ({ resource, compact }: FluxChainWidgetProps) => {
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
      <Widget span={1} title="Dependency Chain" compact={compact}>
        {fullChain.length === 0 ? (
          <p className="text-xs text-default-400">No parent resources</p>
        ) : (
          <div>
            {fullChain.map((res) => (
              <div key={res.uid}>
                <Link
                  to={`${ROUTES.RESOURCE}/${res.uid}`}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-default-100 text-white w-full"
                >
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass(res)}`}
                  />
                  <div className="flex-shrink-0">
                    <AppLogo kind={res.kind} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">
                      {res.name}
                    </p>
                    <p className="text-xs text-default-400">{res.kind}</p>
                  </div>
                  <StatusChip resource={res} />
                </Link>
                <div className="ml-[13px] h-4 border-l border-dashed border-default-300" />
              </div>
            ))}

            {/* Current resource — highlighted */}
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-content2 border border-default-200">
              <div
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 border-2 border-background ${dotClass(resource)}`}
              />
              <div className="flex-shrink-0">
                <AppLogo kind={resource.kind} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate leading-tight">
                  {resource.name}
                </p>
                <p className="text-xs text-default-400">{resource.kind}</p>
              </div>
              <StatusChip resource={resource} />
            </div>
          </div>
        )}
      </Widget>
    );
  }
);

export default FluxChainWidget;
