export enum RESOURCE_TYPE {
  KUSTOMIZATION = "Kustomization",
  HELM_RELEASE = "HelmRelease",
  HELM_CHART = "HelmChart",
  HELM_REPOSITORY = "HelmRepository",
  GIT_REPOSITORY = "GitRepository",
  OCI_REPOSITORY = "OCIRepository",
  BUCKET = "Bucket",

  POD = "Pod",
  DEPLOYMENT = "Deployment",
  SERVICE = "Service",
  INGRESS = "Ingress",
  INGRESSROUTE = "IngressRoute",
  HTTPROUTE = "HTTPRoute",
  GATEWAY = "Gateway",
  GATEWAYCLASS = "GatewayClass",
  CERTIFICATE = "Certificate",
  MIDDLEWARE = "Middleware",
  CRONJOB = "CronJob",
  NAMESPACE = "Namespace",
  REPLICASET = "ReplicaSet",
  ENDPOINTSLICE = "EndpointSlice",
  SERVICEACCOUNT = "ServiceAccount",
  ENDPOINTS = "Endpoints",
  PV = "PersistentVolume",
  PVC = "PersistentVolumeClaim",
  VOLUME = "Volume",
  NODE = "Node",
  JOB = "Job",
  SECRET = "Secret",
  STATEFULSET = "StatefulSet",
  CONFIGMAP = "ConfigMap",
  ROLE = "Role",
  ROLEBINDING = "RoleBinding",
  NETWORKPOLICY = "NetworkPolicy",
  DAEMONSET = "DaemonSet",

  ONEPASWORDITEM = "OnePasswordItem",
  SERVICEMONITOR = "ServiceMonitor",
  PODMONITOR = "PodMonitor",
  ALERTMANAGERCONFIG = "AlertmanagerConfig",
  PROMETHEUSRULE = "PrometheusRule",
  PROMETHEUS = "Prometheus",

  CLUSTER_ROLE = "ClusterRole",
  CLUSTER_ROLE_BINDING = "ClusterRoleBinding",
  CRD = "CustomResourceDefinition",

  VULNERABILITY_REPORT = "VulnerabilityReport",
  CONFIG_AUDIT_REPORT = "ConfigAuditReport",
  EXPOSED_SECRET_REPORT = "ExposedSecretReport",
  RBAC_ASSESSMENT_REPORT = "RbacAssessmentReport"
}

// Flux classification emitted by the backend on each resource.
export type FluxRole = "application" | "repository";

// Flux kinds for the dashboard kind filter. Per-resource classification comes
// from the backend (fluxRole on the DTO), not these sets.
export const FLUX_APPLICATION_KINDS = [
  RESOURCE_TYPE.KUSTOMIZATION,
  RESOURCE_TYPE.HELM_RELEASE,
  RESOURCE_TYPE.HELM_CHART,
] as const;

export const FLUX_REPOSITORY_KINDS = [
  RESOURCE_TYPE.HELM_REPOSITORY,
  RESOURCE_TYPE.GIT_REPOSITORY,
  RESOURCE_TYPE.OCI_REPOSITORY,
  RESOURCE_TYPE.BUCKET,
] as const;

export const FLUX_KINDS: RESOURCE_TYPE[] = [
  ...FLUX_APPLICATION_KINDS,
  ...FLUX_REPOSITORY_KINDS,
];

/** HeroUI semantic color for a Longhorn volume robustness value. Mirrors the
 * backend status mapping in infrastructure/kubernetes/longhorn.go. */
export function robustnessColor(
  robustness: string,
): "success" | "warning" | "danger" | "default" {
  switch (robustness) {
    case "healthy":
      return "success";
    case "degraded":
      return "warning";
    case "faulted":
      return "danger";
    default:
      return "default";
  }
}

export enum FLUX_CONTROLLER {
  KUSTOMIZATION = "kustomize-controller",
  HELM = "helm-controller",
  NOTIFICATION = "notification-controller",
  SOURCE = "source-controller",
};

export const FLUX_VERSION_LABEL = "app.kubernetes.io/version";


export const FLUX_NAMESPACE = "flux-system";
