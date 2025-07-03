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
  CRONJOB = "Cronjob",
  NAMESPACE = "Namespace",
  REPLICASET = "ReplicaSet",
  ENDPOINTSLICE = "EndpointSlice",
  SERVICEACCOUNT = "ServiceAccount",
  ENDPOINTS = "Endpoints",
  PV = "PersistentVolume",
  PVC = "PersistentVolumeClaim",
  VOLUME = "Volume",
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

export enum FLUX_CONTROLLER {
  KUSTOMIZATION = "kustomize-controller",
  HELM = "helm-controller",
  NOTIFICATION = "notification-controller",
  SOURCE = "source-controller",
};

export const FLUX_VERSION_LABEL = "app.kubernetes.io/version";


export const FLUX_NAMESPACE = "flux-system";
