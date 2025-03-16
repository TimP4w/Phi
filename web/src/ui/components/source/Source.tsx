import "./source.scss";
import {
  KustomizationNode,
  Repository,
  TreeNode,
} from "../../../core/fluxTree/models/tree";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";

type SourceProps = {
  node: TreeNode;
};

const Source: React.FC<SourceProps> = ({ node }: SourceProps) => {
  const fluxTreeStore = useInjection(FluxTreeStore);

  if (node.kind === RESOURCE_TYPE.KUSTOMIZATION) {
    const kustomization = node as KustomizationNode;

    if (!kustomization) {
      return;
    }

    const metadata = kustomization.metadata;
    if (!metadata) {
      return;
    }
    const source: Repository | null =
      fluxTreeStore.findRepositoryByRef(metadata.sourceRef);
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

    const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.stopPropagation();
      window.open(url(), "_blank");
    };

    return (
      <div className="source">
        <span onClick={handleLinkClick} className="source__link">
          <FontAwesomeIcon icon="code-commit"></FontAwesomeIcon>
          {" " + kustomization.getLastAttemptedHash().slice(0, 8)}
          {sourceCode}
        </span>
      </div>
    );
  }

  if (node.kind === "HelmRelease") {
    return <span className="source"></span>;
  }

  return null;
};

export default Source;
