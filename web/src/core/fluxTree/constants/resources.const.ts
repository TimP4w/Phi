export enum RESOURCE_TYPE {
  POD = "Pod",
  DEPLOYMENT = "Deployment",
  SERVICE = "Service",
  INGRESS = "Ingress",
  KUSTOMIZATION = "Kustomization",
  HELM_RELEASE = "HelmRelease",
  HELM_CHART = "HelmChart",
  HELM_REPOSITORY = "HelmRepository",
  GIT_REPOSITORY = "GitRepository",
  OCI_REPOSITORY = "OCIRepository",
  BUCKET = "Bucket",
  PVC = "PersistentVolumeClaim",
}
