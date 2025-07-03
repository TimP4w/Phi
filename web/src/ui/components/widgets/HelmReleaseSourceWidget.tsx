import { observer } from "mobx-react-lite";

import { Kustomization, Repository } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import Source from "../source/Source";
import { Link, Skeleton } from "@heroui/react";
import { useInjection } from "inversify-react";
import { useEffect, useState } from "react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { ROUTES } from "../../routes/routes.enum";

type HelmReleaseSourceWidgetProps = {
  resource?: Kustomization;
};

const HelmReleaseSourceWidget: React.FC<HelmReleaseSourceWidgetProps> =
  observer(({ resource }: HelmReleaseSourceWidgetProps) => {
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
      <Widget span={1} title="HelmRelease Source" subtitle="">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-default-400">Repository</span>
            <span className="font-mono text-xs items-center content-center">
              {repository ? (
                <Link
                  href={ROUTES.RESOURCE + `/${repository.uid}`}
                  showAnchorIcon
                  className="text-white hover:text-underline"
                >
                  <span className="font-mono text-xs ">
                    {resource.metadata?.sourceRef.name} ({repository.kind})
                  </span>
                </Link>
              ) : (
                <span className="text-danger font-bold">NOT FOUND</span>
              )}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-default-400">Version</span>
            <span className="font-mono text-xs content-center">
              <Source fluxResource={resource} />
            </span>
          </div>
        </div>
      </Widget>
    );
  });

export default HelmReleaseSourceWidget;
