import { observer } from "mobx-react-lite";
import { Kustomization, Repository } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import Source from "../source/Source";
import { Link, Skeleton, Tooltip } from "@heroui/react";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useEffect, useState } from "react";
import { ROUTES } from "../../routes/routes.enum";
import { AlertTriangle, RefreshCw } from "lucide-react";

type KustomizationSourceWidgetProps = {
  resource?: Kustomization;
  compact?: boolean;
};

const shortHash = (revision: string): string => {
  const hash = revision.slice(revision.indexOf(":") + 1);
  return hash.slice(0, 8);
};

const KustomizationSourceWidget: React.FC<KustomizationSourceWidgetProps> =
  observer(({ resource, compact }: KustomizationSourceWidgetProps) => {
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

    const applied = resource.metadata?.lastAppliedRevision ?? "";
    const attempted = resource.metadata?.lastAttemptedRevision ?? "";
    const hasDrift =
      applied && attempted && applied !== attempted;

    return (
      <Widget span={1} title="Kustomization Source" compact={compact}>
        {/* Reconciling indicator */}
        {resource.metadata?.isReconciling && (
          <div className="flex items-center gap-1.5 text-xs text-warning mb-2">
            <RefreshCw className="w-3 h-3 animate-spin flex-shrink-0" />
            <span>Reconciling…</span>
          </div>
        )}

        {/* Drift warning */}
        {hasDrift && (
          <Tooltip
            content={`Applied: ${shortHash(applied)} — Attempted: ${shortHash(attempted)}`}
            className="dark"
          >
            <div className="flex items-center gap-1.5 text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-2 py-1 mb-2 cursor-default">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span>Revision drift detected</span>
            </div>
          </Tooltip>
        )}

        <div className="space-y-2">
          {/* Source repo */}
          <div className="flex justify-between items-start gap-2">
            <span className="text-default-400 text-xs flex-shrink-0">Source</span>
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

          {/* Path */}
          <div className="flex justify-between items-center gap-2">
            <span className="text-default-400 text-xs flex-shrink-0">Path</span>
            <span className="font-mono text-xs text-default-300 text-right truncate max-w-[160px]">
              {resource.metadata?.path}
            </span>
          </div>

          {/* Applied revision */}
          <div className="flex justify-between items-center gap-2">
            <span className="text-default-400 text-xs flex-shrink-0">
              {hasDrift ? "Applied" : "Revision"}
            </span>
            <span className="font-mono text-xs">
              <Source fluxResource={resource} />
            </span>
          </div>

          {/* Attempted revision — only shown on drift */}
          {hasDrift && (
            <div className="flex justify-between items-center gap-2">
              <span className="text-warning text-xs flex-shrink-0">Attempted</span>
              <span className="font-mono text-xs text-warning">
                {shortHash(attempted)}
              </span>
            </div>
          )}
        </div>
      </Widget>
    );
  });

export default KustomizationSourceWidget;
