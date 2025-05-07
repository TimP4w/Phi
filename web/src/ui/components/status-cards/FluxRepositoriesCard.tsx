import { observer } from "mobx-react-lite";

import { Card, CardBody, CardHeader } from "@heroui/react";
import { ResourceStatus, TreeNode } from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { VictoryContainer, VictoryPie, VictoryTooltip } from "victory";
import { COLORS } from "../../shared/colors";

type FluxRepositoriesProps = object;

const FluxRepositoriesCard: React.FC<FluxRepositoriesProps> = observer(
  (_: FluxRepositoriesProps) => {
    const fluxTreeStore = useInjection(FluxTreeStore);

    const statusData = [
      {
        x: "Healthy",
        y: fluxTreeStore.repositories.filter(
          (node: TreeNode) => node.status === ResourceStatus.SUCCESS
        ).length,
      },
      {
        x: "Reconciling",
        y: fluxTreeStore.repositories.filter(
          (node: TreeNode) => node.status === ResourceStatus.PENDING
        ).length,
      },
      {
        x: "Unhealthy",
        y: fluxTreeStore.repositories.filter(
          (node: TreeNode) =>
            node.status === ResourceStatus.FAILED ||
            node.status === ResourceStatus.WARNING
        ).length,
      },
      {
        x: "Unknown",
        y: fluxTreeStore.repositories.filter(
          (node: TreeNode) => node.status === ResourceStatus.UNKNOWN
        ).length,
      },
    ];

    return (
      <Card className="max-w-[250px] max-h-[250px]">
        <CardHeader className="flex gap-3">
          <div className="flex flex-col">
            <p className="text-md">Repositories Status</p>
          </div>
        </CardHeader>
        <CardBody>
          <VictoryPie
            containerComponent={<VictoryContainer responsive={false} />}
            colorScale={[
              COLORS.SUCCESS,
              COLORS.WARNING,
              COLORS.ERROR,
              COLORS.FONT_GREY,
            ]}
            innerRadius={50}
            data={statusData}
            width={225}
            height={165}
            padding={0}
            animate={{ duration: 300 }}
            style={{
              labels: {
                fontSize: 16,
                fill: COLORS.FONT,
              },
            }}
            labelComponent={
              <VictoryTooltip
                constrainToVisibleArea
                flyoutStyle={{
                  fill: COLORS.MAIN,
                }}
                text={({ datum }) => `${datum.x} (${datum.y.toFixed()})`}
              />
            }
          />
        </CardBody>
      </Card>
    );
  }
);

export default FluxRepositoriesCard;
