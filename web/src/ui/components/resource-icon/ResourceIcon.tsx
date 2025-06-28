import { observer } from "mobx-react-lite";
import KustomizationLogo from "../../assets/kustomization-logo";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import {
  Si1password,
  SiGit,
  SiHelm,
  SiPrometheus,
} from "@icons-pack/react-simple-icons";
import { Package, Map, FileDown } from "lucide-react";
import SvgCronjob from "../../assets/cronjob";
import SvgDeploy from "../../assets/deploy";
import SvgPod from "../../assets/pod";
import SvgIng from "../../assets/ing";
import SvgNs from "../../assets/ns";
import SvgRs from "../../assets/rs";
import SvgSvc from "../../assets/svc";
import SvgEp from "../../assets/ep";
import SvgSa from "../../assets/sa";
import SvgPv from "../../assets/pv";
import SvgPvc from "../../assets/pvc";
import SvgVol from "../../assets/vol";
import SvgJob from "../../assets/job";
import SvgSecret from "../../assets/secret";
import SvgSts from "../../assets/sts";
import SvgCm from "../../assets/cm";
import SvgRole from "../../assets/role";
import SvgRb from "../../assets/rb";
import SvgNetpol from "../../assets/netpol";
import SvgDs from "../../assets/ds";

type AppLogoProps = {
  kind?: string;
  width?: number;
  height?: number;
};

const kindToIcon: Record<string, React.ReactNode> = {
  [RESOURCE_TYPE.KUSTOMIZATION]: <KustomizationLogo />,
  [RESOURCE_TYPE.HELM_RELEASE]: <SiHelm size={32} />,
  [RESOURCE_TYPE.OCI_REPOSITORY]: <Package size={32} />,
  [RESOURCE_TYPE.GIT_REPOSITORY]: <SiGit size={32} />,
  [RESOURCE_TYPE.HELM_CHART]: <Map size={24} />,
  [RESOURCE_TYPE.HELM_REPOSITORY]: <FileDown size={32} />,
  [RESOURCE_TYPE.BUCKET]: <span style={{ fontSize: 22 }}>🪣</span>,

  [RESOURCE_TYPE.CRONJOB]: <SvgCronjob width={32} height={32} />,
  [RESOURCE_TYPE.DEPLOYMENT]: <SvgDeploy width={32} height={32} />,
  [RESOURCE_TYPE.POD]: <SvgPod width={32} height={32} />,
  [RESOURCE_TYPE.INGRESS]: <SvgIng width={32} height={32} />,
  [RESOURCE_TYPE.NAMESPACE]: <SvgNs width={32} height={32} />,
  [RESOURCE_TYPE.REPLICASET]: <SvgRs width={32} height={32} />,
  [RESOURCE_TYPE.SERVICE]: <SvgSvc width={32} height={32} />,
  [RESOURCE_TYPE.ENDPOINTSLICE]: <SvgEp width={32} height={32} />,
  [RESOURCE_TYPE.SERVICEACCOUNT]: <SvgSa width={32} height={32} />,
  [RESOURCE_TYPE.ENDPOINTS]: <SvgEp width={32} height={32} />,
  [RESOURCE_TYPE.PV]: <SvgPv width={32} height={32} />,
  [RESOURCE_TYPE.PVC]: <SvgPvc width={32} height={32} />,
  [RESOURCE_TYPE.VOLUME]: <SvgVol width={32} height={32} />,
  [RESOURCE_TYPE.JOB]: <SvgJob width={32} height={32} />,
  [RESOURCE_TYPE.SECRET]: <SvgSecret width={32} height={32} />,
  [RESOURCE_TYPE.STATEFULSET]: <SvgSts width={32} height={32} />,
  [RESOURCE_TYPE.CONFIGMAP]: <SvgCm width={32} height={32} />,
  [RESOURCE_TYPE.ROLE]: <SvgRole width={32} height={32} />,
  [RESOURCE_TYPE.ROLEBINDING]: <SvgRb width={32} height={32} />,
  [RESOURCE_TYPE.NETWORKPOLICY]: <SvgNetpol width={32} height={32} />,
  [RESOURCE_TYPE.DAEMONSET]: <SvgDs width={32} height={32} />,

  [RESOURCE_TYPE.ONEPASWORDITEM]: <Si1password size={32} />,
  [RESOURCE_TYPE.SERVICEMONITOR]: <SiPrometheus size={32} />,
  [RESOURCE_TYPE.PODMONITOR]: <SiPrometheus size={32} />,
  [RESOURCE_TYPE.ALERTMANAGERCONFIG]: <SiPrometheus size={32} />,
  [RESOURCE_TYPE.PROMETHEUSRULE]: <SiPrometheus size={32} />,
  [RESOURCE_TYPE.PROMETHEUS]: <SiPrometheus size={32} />,
};

const AppLogo: React.FC<AppLogoProps> = observer(({ kind }: AppLogoProps) => {
  return (
    <div className="app-logo text-white">{kind ? kindToIcon[kind] : <></>}</div>
  );
});

export default AppLogo;
