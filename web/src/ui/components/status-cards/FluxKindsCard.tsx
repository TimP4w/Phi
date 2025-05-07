import { observer } from "mobx-react-lite";

import { Card, CardBody, CardHeader } from "@heroui/react";
import { TreeNode } from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { VictoryContainer, VictoryPie, VictoryTooltip } from "victory";
import { COLORS } from "../../shared/colors";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";

type FluxKindsProps = object;

const FluxKindsCard: React.FC<FluxKindsProps> = observer(
  (_: FluxKindsProps) => {
    const fluxTreeStore = useInjection(FluxTreeStore);

    const statusData = [
      {
        x: "Kustomizations",
        y: fluxTreeStore.applications.filter(
          (node: TreeNode) => node.kind === RESOURCE_TYPE.KUSTOMIZATION
        ).length,
      },
      {
        x: "HelmReleases",
        y: fluxTreeStore.applications.filter(
          (node: TreeNode) => node.kind === RESOURCE_TYPE.HELM_RELEASE
        ).length,
      },
      {
        x: "HelmCharts",
        y: fluxTreeStore.applications.filter(
          (node: TreeNode) => node.kind === RESOURCE_TYPE.HELM_CHART
        ).length,
      },
      {
        x: "GitRepositories",
        y: fluxTreeStore.repositories.filter(
          (node: TreeNode) => node.kind === RESOURCE_TYPE.GIT_REPOSITORY
        ).length,
      },
      {
        x: "OCIRepositories",
        y: fluxTreeStore.repositories.filter(
          (node: TreeNode) => node.kind === RESOURCE_TYPE.OCI_REPOSITORY
        ).length,
      },
      {
        x: "Buckets",
        y: fluxTreeStore.repositories.filter(
          (node: TreeNode) => node.kind === RESOURCE_TYPE.BUCKET
        ).length,
      },
    ];

    return (
      <Card className="max-w-[250px] max-h-[250px]">
        <CardHeader className="flex gap-3">
          <div className="flex flex-col">
            <p className="text-md">Kinds Stats</p>
          </div>
        </CardHeader>
        <CardBody>
          <VictoryPie
            containerComponent={<VictoryContainer responsive={false} />}
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

export default FluxKindsCard;
