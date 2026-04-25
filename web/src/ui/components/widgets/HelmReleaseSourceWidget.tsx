import { observer } from "mobx-react-lite";
import { HelmRelease, Repository } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import Source from "../source/Source";
import { Link, Skeleton } from "@heroui/react";
import { useInjection } from "inversify-react";
import { useEffect, useState } from "react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { ROUTES } from "../../routes/routes.enum";
import { RefreshCw } from "lucide-react";

type HelmReleaseSourceWidgetProps = {
  resource?: HelmRelease;
  compact?: boolean;
};

const HelmReleaseSourceWidget: React.FC<HelmReleaseSourceWidgetProps> =
  observer(({ resource, compact }: HelmReleaseSourceWidgetProps) => {
    const fluxTreeStore = useInjection(FluxTreeStore);
    const [repository, setRepository] = useState<Repository | null>(null);

    useEffect(() => {
      const repo = fluxTreeStore.findRepositoryByNameAndKind(
        resource?.metadata?.sourceRef.name,
        resource?.metadata?.sourceRef.kind
      );
      setRepository(repo);
    }, [fluxTreeStore, resource]);

    if (!resource) {
      return (
        <Skeleton className="rounded-lg">
          <div className="h-24 rounded-lg bg-default-300" />
        </Skeleton>
      );
    }

    return (
      <Widget span={1} title="HelmRelease Source" compact={compact}>
        {/* Reconciling indicator */}
        {resource.metadata?.isReconciling && (
          <div className="flex items-center gap-1.5 text-xs text-warning mb-2">
            <RefreshCw className="w-3 h-3 animate-spin flex-shrink-0" />
            <span>Reconciling…</span>
          </div>
        )}

        <div className="space-y-2">
          {/* Chart name */}
          <div className="flex justify-between items-center gap-2">
            <span className="text-default-400 text-xs flex-shrink-0">Chart</span>
            <span className="font-mono text-xs text-right truncate max-w-[160px]">
              {resource.metadata?.chartName}
            </span>
          </div>

          {/* Chart version */}
          <div className="flex justify-between items-center gap-2">
            <span className="text-default-400 text-xs flex-shrink-0">Version</span>
            <span className="font-mono text-xs">
              <Source fluxResource={resource} />
            </span>
          </div>

          {/* Repository */}
          <div className="flex justify-between items-start gap-2">
            <span className="text-default-400 text-xs flex-shrink-0">Repository</span>
            <span className="font-mono text-xs text-right">
              {repository ? (
                <Link
                  href={ROUTES.RESOURCE + `/${repository.uid}`}
                  className="text-white hover:underline"
                >
                  {resource.metadata?.sourceRef.name}
                  <span className="text-default-400 ml-1">
                    ({repository.kind})
                  </span>
                </Link>
              ) : (
                <span className="text-danger font-bold">NOT FOUND</span>
              )}
            </span>
          </div>
        </div>
      </Widget>
    );
  });

export default HelmReleaseSourceWidget;
