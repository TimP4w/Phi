import { observer } from "mobx-react-lite";
import { Chip } from "@heroui/react";
import { Deployment } from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { Link } from "react-router-dom";
import WidgetCard from "./Widget";
import { ROUTES } from "../../routes/routes.enum";
import { useMemo } from "react";
import { FLUX_VERSION_LABEL } from "../../../core/fluxTree/constants/resources.const";
import { statusDotClass } from "../../shared/helpers";

const extractTag = (imageName: string) => {
  const parts = imageName.split(":");
  return parts.length > 1 ? parts[parts.length - 1] : null;
};

const FluxControllersWidget: React.FC = observer(() => {
  const fluxTreeStore = useInjection(FluxTreeStore);
  const fluxDeployments = fluxTreeStore.tree.getFluxControllersDeployments();

  const fluxVersion = useMemo(() => {
    if (fluxDeployments.length === 0) return "Unknown";
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
    <WidgetCard title="FluxCD Controllers">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-default-400">Version</span>
          <Chip size="sm" variant="flat" className="font-mono text-xs h-5">
            {fluxVersion}
          </Chip>
        </div>

        {fluxDeployments.map((resource: Deployment) => (
          <Link key={resource.uid} to={`${ROUTES.RESOURCE}/${resource.uid}`}>
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-content2 transition-colors group">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotClass(resource.status)}`} />
              <span className="text-sm flex-1 min-w-0 truncate text-default-300 group-hover:text-foreground transition-colors">
                {resource.name}
              </span>
              {resource.metadata?.images.map((img) => (
                <span key={img} className="text-xs text-default-500 font-mono flex-shrink-0">
                  {extractTag(img)}
                </span>
              ))}
            </div>
          </Link>
        ))}

        {fluxDeployments.length === 0 && (
          <span className="text-sm text-default-400 py-2 px-2">No controllers found</span>
        )}
      </div>
    </WidgetCard>
  );
});

export default FluxControllersWidget;
