import { observer } from "mobx-react-lite";
import KustomizationLogo from "../../assets/kustomization-logo";
import HelmLogo from "../../assets/helm-logo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { OCILogo } from "../../assets/oci-logo";
import { GitLogo } from "../../assets/git-logo";
import { COLORS } from "../../shared/colors";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";

type AppLogoProps = {
  kind: string;
  width?: number;
  height?: number;
};

const AppLogo: React.FC<AppLogoProps> = observer(({ kind }: AppLogoProps) => {
  return (
    <div className="app-logo">
      {kind === RESOURCE_TYPE.KUSTOMIZATION && <KustomizationLogo />}
      {kind === RESOURCE_TYPE.HELM_RELEASE && <HelmLogo />}
      {kind === RESOURCE_TYPE.OCI_REPOSITORY && <OCILogo />}
      {kind === RESOURCE_TYPE.GIT_REPOSITORY && <GitLogo />}
      {kind === RESOURCE_TYPE.HELM_CHART && (
        <div>
          <HelmLogo />
          <FontAwesomeIcon
            icon="map"
            size="1x"
            color={COLORS.WARNING}
            style={{ position: "absolute", bottom: 0, right: 0 }}
          />
        </div>
      )}
      {kind === RESOURCE_TYPE.HELM_REPOSITORY && (
        <div>
          <HelmLogo />
          <FontAwesomeIcon
            icon="cloud"
            size="1x"
            color={COLORS.INFO}
            style={{ position: "absolute", bottom: 0, right: 0 }}
          />
        </div>
      )}
    </div>
  );
});

export default AppLogo;
