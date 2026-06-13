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
  CRONJOB = "Cronjob",
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
  CRD = "CustomResourceDefinition"
}

// Resource kinds that carry RouteMetadata and act as HTTP routing entry points
// in the network topology (Ingress, Traefik IngressRoute, Gateway API HTTPRoute).
export const ROUTE_KINDS = new Set<string>([
  RESOURCE_TYPE.INGRESS,
  RESOURCE_TYPE.INGRESSROUTE,
  RESOURCE_TYPE.HTTPROUTE,
]);

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
