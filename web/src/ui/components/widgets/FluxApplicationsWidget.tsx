import { observer } from "mobx-react-lite";

import {
  ResourceStatus,
  KubeResource,
} from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { COLORS } from "../../shared/colors";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import WidgetCard from "./Widget";
import ChartTooltip from "./ChartTooltip";

type FluxApplicationsWidgetProps = {
  filters: string[];
  toggleStatusFilter: (status: ResourceStatus) => void;
};

const FluxApplicationsWidget: React.FC<FluxApplicationsWidgetProps> = observer(
  ({ filters, toggleStatusFilter }: FluxApplicationsWidgetProps) => {
    const fluxTreeStore = useInjection(FluxTreeStore);

    const statusData = [
      {
        name: "Ready",
        filter: ResourceStatus.SUCCESS,
        value:
          fluxTreeStore.applications.filter(
            (resource: KubeResource) =>
              resource.status === ResourceStatus.SUCCESS
          ).length +
          fluxTreeStore.repositories.filter(
            (resource: KubeResource) =>
              resource.status === ResourceStatus.SUCCESS
          ).length,
        fill: COLORS.SUCCESS,
      },
      {
        name: "Reconciling",
        filter: ResourceStatus.PENDING,
        value:
          fluxTreeStore.applications.filter(
            (resource: KubeResource) =>
              resource.status === ResourceStatus.PENDING
          ).length +
          fluxTreeStore.repositories.filter(
            (resource: KubeResource) =>
              resource.status === ResourceStatus.PENDING
          ).length,
        fill: COLORS.WARNING,
      },
      {
        name: "Not Ready",
        filter: ResourceStatus.FAILED,
        value:
          fluxTreeStore.applications.filter(
            (resource: KubeResource) =>
              resource.status === ResourceStatus.FAILED ||
              resource.status === ResourceStatus.WARNING
          ).length +
          fluxTreeStore.repositories.filter(
            (resource: KubeResource) =>
              resource.status === ResourceStatus.FAILED ||
              resource.status === ResourceStatus.WARNING
          ).length,
        fill: COLORS.ERROR,
      },
      {
        name: "Unknown",
        filter: ResourceStatus.UNKNOWN,
        value:
          fluxTreeStore.applications.filter(
            (resource: KubeResource) =>
              resource.status === ResourceStatus.UNKNOWN
          ).length +
          fluxTreeStore.repositories.filter(
            (resource: KubeResource) =>
              resource.status === ResourceStatus.UNKNOWN
          ).length,
        fill: COLORS.INFO,
      },
    ];

    return (
      <WidgetCard
        title="Applications Status"
        subtitle="Click to filter applications"
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
                  onClick={(data) => toggleStatusFilter(data.filter)}
                  className="cursor-pointer"
                >
                  {statusData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
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

export default FluxApplicationsWidget;
