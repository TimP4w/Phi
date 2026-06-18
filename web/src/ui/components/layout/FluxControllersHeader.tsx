import { observer } from "mobx-react-lite";
import { Chip, Tooltip } from "@heroui/react";
import { Deployment } from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { Link } from "react-router-dom";
import { ROUTES } from "../../routes/routes.enum";
import { useMemo } from "react";
import { FLUX_VERSION_LABEL } from "../../../core/fluxTree/constants/resources.const";
import { SiFlux } from "@icons-pack/react-simple-icons";
import { statusDotClass } from "../../shared/helpers";

const extractTag = (imageName: string) => {
  const parts = imageName.split(":");
  return parts.length > 1 ? parts[parts.length - 1] : null;
};

// Trim the conventional "-controller" suffix so pills stay compact.
const shortName = (name: string) => name.replace(/-controller$/, "");

/**
 * Renders the FluxCD controllers as compact status pills in the app header,
 * with the detected Flux version. Pulls directly from the store so it can be
 * dropped into the shared Header without prop drilling. Self-hides when no
 * controllers are present.
 */
const FluxControllersHeader: React.FC = observer(() => {
  const fluxTreeStore = useInjection(FluxTreeStore);
  const fluxDeployments = fluxTreeStore.tree.getFluxControllersDeployments();

  const fluxVersion = useMemo(() => {
    if (fluxDeployments.length === 0) return null;
    const versions = fluxDeployments
      .map((dep) => dep.labels.get(FLUX_VERSION_LABEL))
      .filter(Boolean) as string[];
    if (versions.length === 0) return null;
    const counts = versions.reduce<Record<string, number>>((acc, v) => {
      acc[v] = (acc[v] || 0) + 1;
      return acc;
    }, {});
    const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return mostCommon ? mostCommon[0] : null;
  }, [fluxDeployments]);

  if (fluxDeployments.length === 0) return null;

  return (
    <div className="hidden lg:flex items-center gap-4">
      {fluxVersion && (
        <Chip
          size="md"
          variant="flat"
          className="font-mono text-xs h-5"
          startContent={<SiFlux color="#326CE5" className="w-3 h-3 ml-0.5" />}
        >
          {fluxVersion}
        </Chip>
      )}
      <div className="flex items-center gap-4">
        {fluxDeployments.map((resource: Deployment) => {
          const tag = resource.metadata?.images
            .map(extractTag)
            .filter(Boolean)
            .join(", ");
          return (
            <Tooltip
              key={resource.uid}
              size="sm"
              content={
                <div className="flex flex-col">
                  <span className="font-medium">{resource.name}</span>
                  {tag && (
                    <span className="font-mono text-default-400">{tag}</span>
                  )}
                </div>
              }
            >
              <Link
                to={`${ROUTES.RESOURCE}/${resource.uid}`}
                className="flex items-center gap-1.5 group"
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClass(resource.status)}`}
                />
                <span className="text-xs text-default-400 group-hover:text-foreground transition-colors">
                  {shortName(resource.name)}
                </span>
              </Link>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
});

export default FluxControllersHeader;
