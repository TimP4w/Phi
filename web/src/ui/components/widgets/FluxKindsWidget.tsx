import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { KubeResource } from "../../../core/fluxTree/models/tree";
import WidgetCard from "./Widget";

type FluxKindsWidgetProps = {
  filters: string[];
  toggleKindsFilter: (kind: RESOURCE_TYPE) => void;
};

const KIND_CONFIG: { label: string; kind: RESOURCE_TYPE; color: string }[] = [
  { label: "Kustomizations", kind: RESOURCE_TYPE.KUSTOMIZATION, color: "#66AAF9" },
  { label: "HelmReleases", kind: RESOURCE_TYPE.HELM_RELEASE, color: "#AE7EDE" },
  { label: "HelmCharts", kind: RESOURCE_TYPE.HELM_CHART, color: "#DDB414" },
  { label: "HelmRepositories", kind: RESOURCE_TYPE.HELM_REPOSITORY, color: "#74DFA2" },
  { label: "GitRepositories", kind: RESOURCE_TYPE.GIT_REPOSITORY, color: "#F871A0" },
  { label: "OCIRepositories", kind: RESOURCE_TYPE.OCI_REPOSITORY, color: "#FF95E1" },
  { label: "Buckets", kind: RESOURCE_TYPE.BUCKET, color: "#C3F4FD" },
];

const FluxKindsWidget: React.FC<FluxKindsWidgetProps> = observer(
  ({ filters, toggleKindsFilter }) => {
    const fluxTreeStore = useInjection(FluxTreeStore);
    const all: KubeResource[] = [
      ...fluxTreeStore.applications,
      ...fluxTreeStore.repositories,
    ];
    const total = all.length;

    return (
      <WidgetCard title="Resource Types" span={1}>
        <div className="flex flex-col gap-1">
          {KIND_CONFIG.map(({ label, kind, color }) => {
            const count = all.filter((r) => r.kind === kind).length;
            const pct = total > 0 ? (count / total) * 100 : 0;
            const isActive = filters.includes(kind);
            return (
              <div
                key={kind}
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors select-none ${
                  isActive ? "bg-content2" : "hover:bg-content2/50"
                }`}
                onClick={() => toggleKindsFilter(kind)}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-default-400 flex-1 min-w-0 truncate">
                  {label}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-14 h-1 bg-default-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-xs font-mono text-default-400 w-4 text-right tabular-nums">
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </WidgetCard>
    );
  }
);

export default FluxKindsWidget;
