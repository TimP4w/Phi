import { observer } from "mobx-react-lite";

import { Card, CardBody, Chip } from "@heroui/react";
import { Deployment } from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { Link } from "react-router-dom";
import { colorByStatus, statusText } from "../../shared/helpers";
import WidgetCard from "./Widget";
import { ROUTES } from "../../routes/routes.enum";

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

    return (
      <WidgetCard
        span={2}
        title="FluxCD Controllers"
        subtitle="Status of core Flux controllers"
      >
        <div className="flex flex-col gap-3">
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
                        <span className="text-sm text-default-400">
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
