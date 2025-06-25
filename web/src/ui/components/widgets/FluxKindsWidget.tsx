import { observer } from "mobx-react-lite";
import { ResponsiveContainer, Pie, Cell, PieChart, Tooltip } from "recharts";
import { useInjection } from "inversify-react";

import { KubeResource } from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import WidgetCard from "./Widget";
import ChartTooltip from "./ChartTooltip";

type FluxKindsWidgetProps = {
  filters: string[];
  toggleKindsFilter: (kind: RESOURCE_TYPE) => void;
};

const FluxKindsWidget: React.FC<FluxKindsWidgetProps> = observer(
  ({ filters, toggleKindsFilter }: FluxKindsWidgetProps) => {
    const fluxTreeStore = useInjection(FluxTreeStore);

    const statusData = [
      {
        name: "Kustomizations",
        filter: RESOURCE_TYPE.KUSTOMIZATION,
        value: fluxTreeStore.applications.filter(
          (resource: KubeResource) =>
            resource.kind === RESOURCE_TYPE.KUSTOMIZATION
        ).length,
        fill: "#66AAF9",
      },
      {
        name: "HelmReleases",
        filter: RESOURCE_TYPE.HELM_RELEASE,
        value: fluxTreeStore.applications.filter(
          (resource: KubeResource) =>
            resource.kind === RESOURCE_TYPE.HELM_RELEASE
        ).length,
        fill: "#AE7EDE",
      },
      {
        name: "HelmCharts",
        filter: RESOURCE_TYPE.HELM_CHART,
        value: fluxTreeStore.applications.filter(
          (resource: KubeResource) => resource.kind === RESOURCE_TYPE.HELM_CHART
        ).length,
        fill: "#DDB414",
      },
      {
        name: "HelmRepositories",
        filter: RESOURCE_TYPE.HELM_REPOSITORY,
        value: fluxTreeStore.repositories.filter(
          (resource: KubeResource) =>
            resource.kind === RESOURCE_TYPE.HELM_REPOSITORY
        ).length,
        fill: "#74DFA2",
      },
      {
        name: "GitRepositories",
        filter: RESOURCE_TYPE.GIT_REPOSITORY,
        value: fluxTreeStore.repositories.filter(
          (resource: KubeResource) =>
            resource.kind === RESOURCE_TYPE.GIT_REPOSITORY
        ).length,
        fill: "#F871A0",
      },
      {
        name: "OCIRepositories",
        filter: RESOURCE_TYPE.OCI_REPOSITORY,
        value: fluxTreeStore.repositories.filter(
          (resource: KubeResource) =>
            resource.kind === RESOURCE_TYPE.OCI_REPOSITORY
        ).length,
        fill: "#FF95E1",
      },
      {
        name: "Buckets",
        filter: RESOURCE_TYPE.BUCKET,
        value: fluxTreeStore.repositories.filter(
          (resource: KubeResource) => resource.kind === RESOURCE_TYPE.BUCKET
        ).length,
        fill: "#C3F4FD",
      },
    ];

    return (
      <WidgetCard
        title="Resource Types"
        subtitle="Distribution of Flux resource types"
        span={1}
      >
        <div className="flex flex-col justify-between h-full">
          <div className="min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={0}
                  dataKey="value"
                  onClick={(data) => toggleKindsFilter(data.filter)}
                  className="cursor-pointer"
                >
                  {statusData.map((entry, index) => (
                    <Cell
                      key={`cell-kind-${index}`}
                      fill={entry.fill}
                      stroke={
                        filters.includes(entry.filter) ? "#ffffff" : "none"
                      }
                      strokeWidth={filters.includes(entry.filter) ? 2 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {statusData.map((item) => (
              <div key={item.name} className="flex items-center space-x-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.fill }}
                />
                <span className="text-xs text-muted-foreground">
                  {item.name}: {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </WidgetCard>
    );
  }
);

export default FluxKindsWidget;
