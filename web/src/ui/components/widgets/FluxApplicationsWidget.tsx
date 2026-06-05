import { observer } from "mobx-react-lite";
import { ResourceStatus, KubeResource } from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import WidgetCard from "./Widget";

type FluxApplicationsWidgetProps = {
  filters: string[];
  toggleStatusFilter: (status: ResourceStatus) => void;
};

const STATUS_CONFIG = [
  {
    label: "Ready",
    status: ResourceStatus.SUCCESS,
    dotClass: "bg-success",
    textClass: "text-success",
    match: (r: KubeResource) => r.status === ResourceStatus.SUCCESS,
  },
  {
    label: "Not Ready",
    status: ResourceStatus.FAILED,
    dotClass: "bg-danger",
    textClass: "text-danger",
    match: (r: KubeResource) =>
      r.status === ResourceStatus.FAILED || r.status === ResourceStatus.WARNING,
  },
  {
    label: "Reconciling",
    status: ResourceStatus.PENDING,
    dotClass: "bg-warning",
    textClass: "text-warning",
    match: (r: KubeResource) => r.status === ResourceStatus.PENDING,
  },
  {
    label: "Suspended",
    status: ResourceStatus.SUSPENDED,
    dotClass: "bg-default-400",
    textClass: "text-default-400",
    match: (r: KubeResource) => r.status === ResourceStatus.SUSPENDED,
  },
  {
    label: "Unknown",
    status: ResourceStatus.UNKNOWN,
    dotClass: "bg-default-400",
    textClass: "text-default-400",
    match: (r: KubeResource) => r.status === ResourceStatus.UNKNOWN,
  },
];

const FluxApplicationsWidget: React.FC<FluxApplicationsWidgetProps> = observer(
  ({ filters, toggleStatusFilter }) => {
    const fluxTreeStore = useInjection(FluxTreeStore);
    const all = [...fluxTreeStore.applications, ...fluxTreeStore.repositories];
    const total = all.length;

    return (
      <WidgetCard title="Applications" subtitle={`${total} resources`} span={1}>
        <div className="flex flex-col gap-1.5">
          {STATUS_CONFIG.map(({ label, status, dotClass, textClass, match }) => {
            const count = all.filter(match).length;
            const pct = total > 0 ? (count / total) * 100 : 0;
            const isActive = filters.includes(status);
            return (
              <div
                key={status}
                className={`flex flex-col gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors select-none ${
                  isActive ? "bg-content2" : "hover:bg-content2/50"
                }`}
                onClick={() => toggleStatusFilter(status)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                    <span className="text-xs text-default-400">{label}</span>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${count > 0 ? textClass : "text-default-500"}`}>
                    {count}
                  </span>
                </div>
                <div className="h-1 bg-default-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${dotClass} rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </WidgetCard>
    );
  }
);

export default FluxApplicationsWidget;
