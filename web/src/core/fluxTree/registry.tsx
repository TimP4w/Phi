import React from "react";
import {
  Si1password,
  SiGit,
  SiHelm,
  SiPrometheus,
} from "@icons-pack/react-simple-icons";
import { Package, Map as MapIcon, FileDown } from "lucide-react";
import KustomizationLogo from "../../ui/assets/kustomization-logo";
import SvgCronjob from "../../ui/assets/cronjob";
import SvgDeploy from "../../ui/assets/deploy";
import SvgPod from "../../ui/assets/pod";
import SvgIng from "../../ui/assets/ing";
import SvgNs from "../../ui/assets/ns";
import SvgRs from "../../ui/assets/rs";
import SvgSvc from "../../ui/assets/svc";
import SvgEp from "../../ui/assets/ep";
import SvgSa from "../../ui/assets/sa";
import SvgPv from "../../ui/assets/pv";
import SvgPvc from "../../ui/assets/pvc";
import SvgVol from "../../ui/assets/vol";
import SvgJob from "../../ui/assets/job";
import SvgSecret from "../../ui/assets/secret";
import SvgSts from "../../ui/assets/sts";
import SvgCm from "../../ui/assets/cm";
import SvgRole from "../../ui/assets/role";
import SvgRb from "../../ui/assets/rb";
import SvgNetpol from "../../ui/assets/netpol";
import SvgDs from "../../ui/assets/ds";

import { RESOURCE_TYPE } from "./constants/resources.const";
import { GroupKind, groupKindKey } from "./models/groupKind";
import { TreeNodeDto } from "./models/dtos/treeDto";
import {
  KubeResource,
  Kustomization,
  HelmRelease,
  HelmChart,
  HelmRepository,
  GitRepository,
  OCIRepository,
  Pod,
  Deployment,
  PersistentVolumeClaim,
  PersistentVolume,
  LonghornVolume,
  LonghornNode,
  Node,
} from "./models/tree";

// API groups, mirroring the backend registry.
const CORE = "";
const APPS = "apps";
const BATCH = "batch";
const NETWORKING = "networking.k8s.io";
const DISCOVERY = "discovery.k8s.io";
const RBAC = "rbac.authorization.k8s.io";
const FLUX_KUSTOMIZE = "kustomize.toolkit.fluxcd.io";
const FLUX_HELM = "helm.toolkit.fluxcd.io";
const FLUX_SOURCE = "source.toolkit.fluxcd.io";
const LONGHORN = "longhorn.io";
const MONITORING = "monitoring.coreos.com";
const ONEPASSWORD = "onepassword.com";

// The frontend-only concerns of a resource type (classification comes from the DTO).
export type ResourceTypeEntry = {
  ctor?: (dto: TreeNodeDto) => KubeResource;
  icon?: React.ReactNode;
};

// Type registry keyed by GroupKind so colliding kinds resolve independently.
const registry = new Map<string, ResourceTypeEntry>();

function register(group: string, kind: string, entry: ResourceTypeEntry): void {
  const key = groupKindKey({ group, kind });
  registry.set(key, { ...registry.get(key), ...entry });
}

// Model constructors.
register(FLUX_KUSTOMIZE, RESOURCE_TYPE.KUSTOMIZATION, { ctor: (d) => new Kustomization(d) });
register(FLUX_HELM, RESOURCE_TYPE.HELM_RELEASE, { ctor: (d) => new HelmRelease(d) });
register(FLUX_SOURCE, RESOURCE_TYPE.HELM_CHART, { ctor: (d) => new HelmChart(d) });
register(FLUX_SOURCE, RESOURCE_TYPE.HELM_REPOSITORY, { ctor: (d) => new HelmRepository(d) });
register(FLUX_SOURCE, RESOURCE_TYPE.GIT_REPOSITORY, { ctor: (d) => new GitRepository(d) });
register(FLUX_SOURCE, RESOURCE_TYPE.OCI_REPOSITORY, { ctor: (d) => new OCIRepository(d) });
register(CORE, RESOURCE_TYPE.POD, { ctor: (d) => new Pod(d) });
register(APPS, RESOURCE_TYPE.DEPLOYMENT, { ctor: (d) => new Deployment(d) });
register(CORE, RESOURCE_TYPE.PVC, { ctor: (d) => new PersistentVolumeClaim(d) });
register(CORE, RESOURCE_TYPE.PV, { ctor: (d) => new PersistentVolume(d) });
register(CORE, RESOURCE_TYPE.NODE, { ctor: (d) => new Node(d) });
register(LONGHORN, RESOURCE_TYPE.NODE, { ctor: (d) => new LonghornNode(d) });
register(LONGHORN, RESOURCE_TYPE.VOLUME, { ctor: (d) => new LonghornVolume(d) });

// Icons.
register(FLUX_KUSTOMIZE, RESOURCE_TYPE.KUSTOMIZATION, { icon: <KustomizationLogo /> });
register(FLUX_HELM, RESOURCE_TYPE.HELM_RELEASE, { icon: <SiHelm size={32} /> });
register(FLUX_SOURCE, RESOURCE_TYPE.OCI_REPOSITORY, { icon: <Package size={32} /> });
register(FLUX_SOURCE, RESOURCE_TYPE.GIT_REPOSITORY, { icon: <SiGit size={32} /> });
register(FLUX_SOURCE, RESOURCE_TYPE.HELM_CHART, { icon: <MapIcon size={24} /> });
register(FLUX_SOURCE, RESOURCE_TYPE.HELM_REPOSITORY, { icon: <FileDown size={32} /> });
register(FLUX_SOURCE, RESOURCE_TYPE.BUCKET, { icon: <span style={{ fontSize: 22 }}>🪣</span> });
register(BATCH, RESOURCE_TYPE.CRONJOB, { icon: <SvgCronjob width={32} height={32} /> });
register(BATCH, RESOURCE_TYPE.JOB, { icon: <SvgJob width={32} height={32} /> });
register(APPS, RESOURCE_TYPE.DEPLOYMENT, { icon: <SvgDeploy width={32} height={32} /> });
register(APPS, RESOURCE_TYPE.REPLICASET, { icon: <SvgRs width={32} height={32} /> });
register(APPS, RESOURCE_TYPE.STATEFULSET, { icon: <SvgSts width={32} height={32} /> });
register(APPS, RESOURCE_TYPE.DAEMONSET, { icon: <SvgDs width={32} height={32} /> });
register(CORE, RESOURCE_TYPE.POD, { icon: <SvgPod width={32} height={32} /> });
register(CORE, RESOURCE_TYPE.NAMESPACE, { icon: <SvgNs width={32} height={32} /> });
register(CORE, RESOURCE_TYPE.SERVICE, { icon: <SvgSvc width={32} height={32} /> });
register(CORE, RESOURCE_TYPE.SERVICEACCOUNT, { icon: <SvgSa width={32} height={32} /> });
register(CORE, RESOURCE_TYPE.ENDPOINTS, { icon: <SvgEp width={32} height={32} /> });
register(CORE, RESOURCE_TYPE.PV, { icon: <SvgPv width={32} height={32} /> });
register(CORE, RESOURCE_TYPE.PVC, { icon: <SvgPvc width={32} height={32} /> });
register(CORE, RESOURCE_TYPE.SECRET, { icon: <SvgSecret width={32} height={32} /> });
register(CORE, RESOURCE_TYPE.CONFIGMAP, { icon: <SvgCm width={32} height={32} /> });
register(NETWORKING, RESOURCE_TYPE.INGRESS, { icon: <SvgIng width={32} height={32} /> });
register(NETWORKING, RESOURCE_TYPE.NETWORKPOLICY, { icon: <SvgNetpol width={32} height={32} /> });
register(DISCOVERY, RESOURCE_TYPE.ENDPOINTSLICE, { icon: <SvgEp width={32} height={32} /> });
register(RBAC, RESOURCE_TYPE.ROLE, { icon: <SvgRole width={32} height={32} /> });
register(RBAC, RESOURCE_TYPE.ROLEBINDING, { icon: <SvgRb width={32} height={32} /> });
register(LONGHORN, RESOURCE_TYPE.VOLUME, { icon: <SvgVol width={32} height={32} /> });
register(ONEPASSWORD, RESOURCE_TYPE.ONEPASWORDITEM, { icon: <Si1password size={32} /> });
register(MONITORING, RESOURCE_TYPE.SERVICEMONITOR, { icon: <SiPrometheus size={32} /> });
register(MONITORING, RESOURCE_TYPE.PODMONITOR, { icon: <SiPrometheus size={32} /> });
register(MONITORING, RESOURCE_TYPE.ALERTMANAGERCONFIG, { icon: <SiPrometheus size={32} /> });
register(MONITORING, RESOURCE_TYPE.PROMETHEUSRULE, { icon: <SiPrometheus size={32} /> });
register(MONITORING, RESOURCE_TYPE.PROMETHEUS, { icon: <SiPrometheus size={32} /> });

export function lookupCtor(gk: GroupKind): ((dto: TreeNodeDto) => KubeResource) | undefined {
  return registry.get(groupKindKey(gk))?.ctor;
}

export function lookupIcon(gk: GroupKind): React.ReactNode | undefined {
  return registry.get(groupKindKey(gk))?.icon;
}
