import { observer } from "mobx-react-lite";

import { Kustomization } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import Source from "../source/Source";
import { Skeleton } from "@heroui/react";

type HelmReleaseSourceWidgetProps = {
  resource?: Kustomization;
};

const HelmReleaseSourceWidget: React.FC<HelmReleaseSourceWidgetProps> =
  observer(({ resource }: HelmReleaseSourceWidgetProps) => {
    if (!resource) {
      return (
        <Skeleton className="rounded-lg">
          <div className="h-24 rounded-lg bg-default-300" />
        </Skeleton>
      );
    }

    return (
      <Widget span={1} title="HelmRelease Source" subtitle="">
        {/* TODO: Implement and only show for flux resources (basically here only Kustomizations and HelmReleases). Hide for the rest */}

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-default-400">Repository</span>
            <span className="font-mono text-xs items-center">
              {resource.metadata?.sourceRef.name} (
              {resource.metadata?.sourceRef.kind})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-default-400">Version</span>
            <span className="font-mono text-xs">
              <Source fluxResource={resource} />
            </span>
          </div>
        </div>
      </Widget>
    );
  });

export default HelmReleaseSourceWidget;
