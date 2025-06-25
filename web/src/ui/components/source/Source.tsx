import {
  HelmRelease,
  Kustomization,
  Repository,
  KubeResource as FluxResource,
} from "../../../core/fluxTree/models/tree";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { GitCommitHorizontal } from "lucide-react";
import { Link } from "@heroui/react";

type SourceProps = {
  fluxResource: FluxResource;
};

const Source: React.FC<SourceProps> = ({ fluxResource: node }: SourceProps) => {
  const fluxTreeStore = useInjection(FluxTreeStore);

  if (node.kind === RESOURCE_TYPE.KUSTOMIZATION) {
    const kustomization = node as Kustomization;

    if (!kustomization) {
      return;
    }

    const metadata = kustomization.metadata;
    if (!metadata) {
      return;
    }
    const source: Repository | null = fluxTreeStore.findRepositoryByRef(
      metadata.sourceRef
    );
    if (!source) {
      return;
    }

    const sourceUrl = source.getURL();
    const sourceCode = source.getCode();
    const url = () => {
      if (sourceUrl) {
        const domain = sourceUrl.slice(sourceUrl.indexOf("@") + 1);
        return `https://${domain}/commit/${kustomization.getLastAttemptedHash()}`;
      }

      return "";
    };

    return (
      <Link
        href={url()}
        className="flex items-center gap-2 font-mono text-xs hover:underline text-white"
        isExternal
      >
        <GitCommitHorizontal />
        {" " + kustomization.getLastAttemptedHash().slice(0, 8)}
        {sourceCode}
      </Link>
    );
  }

  if (node.kind === "HelmRelease") {
    const helmRelease = node as HelmRelease;
    const metadata = helmRelease.metadata;

    return <span className="font-mono text-xs">{metadata?.chartVersion}</span>;
  }

  return null;
};

export default Source;
