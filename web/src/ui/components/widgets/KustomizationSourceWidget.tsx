import { observer } from "mobx-react-lite";

import { Kustomization, Repository } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import Source from "../source/Source";
import { Link, Skeleton } from "@heroui/react";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useEffect, useState } from "react";
import { ROUTES } from "../../routes/routes.enum";

type FluxKindsProps = {
  resource?: Kustomization;
};

const KustomizationSourceWidget: React.FC<FluxKindsProps> = observer(
  ({ resource }: FluxKindsProps) => {
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
      <Widget span={1} title="Kustomization Source" subtitle="">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-default-400">Repository</span>
            <span className="font-mono text-xs items-center content-center">
              {repository ? (
                <Link
                  href={ROUTES.RESOURCE + `/${repository.uid}`}
                  className="text-white "
                >
                  <span className="font-mono text-xs hover:underline">
                    {resource.metadata?.sourceRef.name} ({repository.kind})
                  </span>
                </Link>
              ) : (
                <span className="text-danger font-bold">NOT FOUND</span>
              )}
            </span>
          </div>
          <div className="flex justify-between flex-wrap">
            <span className="text-default-400">Path</span>
            <span className="font-mono text-xs content-center">
              {resource.metadata?.path}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-default-400">Revision</span>
            <span className="font-mono text-xs content-center">
              <Source fluxResource={resource} />
            </span>
          </div>
        </div>
      </Widget>
    );
  }
);

export default KustomizationSourceWidget;
