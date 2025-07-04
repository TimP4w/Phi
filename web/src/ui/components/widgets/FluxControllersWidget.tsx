import { observer } from "mobx-react-lite";

import { Card, CardBody, Chip } from "@heroui/react";
import { Deployment } from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { Link } from "react-router-dom";
import { colorByStatus, statusText } from "../../shared/helpers";
import WidgetCard from "./Widget";
import { ROUTES } from "../../routes/routes.enum";
import { useMemo } from "react";
import { FLUX_VERSION_LABEL } from "../../../core/fluxTree/constants/resources.const";

type FluxControllersWidgetProps = object;

const FluxControllersWidget: React.FC<FluxControllersWidgetProps> = observer(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (_: FluxControllersWidgetProps) => {
    const fluxTreeStore = useInjection(FluxTreeStore);
    const fluxDeployments = fluxTreeStore.tree.getFluxControllersDeployments();

    const extractTag = (imageName: string) => {
      const parts = imageName.split(":");
      return parts.length > 1 ? parts.pop() : null;
    };

    const fluxVersion = useMemo(() => {
      if (fluxDeployments.length === 0) {
        return "Unknown";
      }
      const versions = fluxDeployments
        .map((dep) => dep.labels.get(FLUX_VERSION_LABEL))
        .filter(Boolean) as string[];
      if (versions.length === 0) return "Unknown";
      const counts = versions.reduce<Record<string, number>>((acc, v) => {
        acc[v] = (acc[v] || 0) + 1;
        return acc;
      }, {});
      const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return mostCommon ? mostCommon[0] : "Unknown";
    }, [fluxDeployments]);

    return (
      <WidgetCard
        span={2}
        title="FluxCD Controllers"
        subtitle="Status of core Flux controllers"
      >
        <div className="flex flex-col gap-3">
          <span className="text-sm text-default-400">
            Running FluxCD version <Chip>{fluxVersion}</Chip>
          </span>

          {fluxDeployments.map((resource: Deployment) => (
            <Link key={resource.uid} to={`${ROUTES.RESOURCE}/${resource.uid}`}>
              <Card className="transition-transform duration-300 transition-colors hover:bg-default/50">
                <CardBody>
                  <div className="flex-1 min-w-0 ">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground truncate">
                        {resource.name}
                      </span>
                      <Chip
                        variant="faded"
                        className={`text-xs`}
                        color={colorByStatus(resource.status)}
                      >
                        {statusText(resource.status)}
                      </Chip>
                    </div>
                    <div>
                      {resource.metadata?.images.map((img) => (
                        <span
                          className="text-sm text-default-400"
                          key={resource.uid}
                        >
                          {extractTag(img)}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </WidgetCard>
    );
  }
);

export default FluxControllersWidget;
