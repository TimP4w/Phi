// Mock FluxCD cluster resource set for Phi screenshots.
// Shapes mirror web/src/core/fluxTree/models/dtos/treeDto.ts (TreeNodeDto).

const G = {
  KUSTOMIZE: "kustomize.toolkit.fluxcd.io",
  HELM: "helm.toolkit.fluxcd.io",
  SOURCE: "source.toolkit.fluxcd.io",
  APPS: "apps",
  CORE: "",
  DISCOVERY: "discovery.k8s.io",
  NETWORKING: "networking.k8s.io",
};

const NOW = Date.now();
const ago = (mins) => new Date(NOW - mins * 60_000).toISOString();

let n = 0;
const uid = (p) => `${p}-${(++n).toString(36).padStart(4, "0")}`;

const resources = [];
const add = (r) => {
  const full = {
    annotations: {},
    labels: {},
    conditions: [],
    status: "success",
    isFluxManaged: false,
    isReconcilable: false,
    hasMetrics: false,
    createdAt: ago(60 * 24 * 7),
    parentIDs: [],
    ...r,
  };
  resources.push(full);
  return full;
};

const cond = (type, ok, reason, message) => ({
  lastTransitionTime: ago(12),
  type,
  status: ok ? "True" : "False",
  reason,
  message,
});

// ── Root: flux-system GitRepository + root Kustomization ──────────────────────
const fluxRepo = add({
  uid: uid("gitrepo"),
  name: "flux-system",
  kind: "GitRepository",
  group: G.SOURCE,
  namespace: "flux-system",
  isFluxManaged: true,
  isReconcilable: true,
  fluxRole: "repository",
  conditions: [cond("Ready", true, "Succeeded", "stored artifact for revision 'main@sha1:9f2c1a4'")],
  gitRepositoryMetadata: {
    url: "https://github.com/timp4w/homelab",
    branch: "main",
    tag: "",
    semver: "",
    name: "flux-system",
    commit: "9f2c1a4",
  },
  fluxMetadata: { isReconciling: false, isSuspended: false, lastSyncAt: ago(3) },
});

const rootKs = add({
  uid: uid("ks"),
  name: "flux-system",
  kind: "Kustomization",
  group: G.KUSTOMIZE,
  namespace: "flux-system",
  isFluxManaged: true,
  isReconcilable: true,
  fluxRole: "application",
  conditions: [cond("Ready", true, "ReconciliationSucceeded", "Applied revision: main@sha1:9f2c1a4")],
  kustomizationMetadata: {
    path: "./clusters/production",
    sourceRef: { kind: "GitRepository", name: "flux-system" },
    lastAppliedRevision: "main@sha1:9f2c1a4",
    lastAttemptedRevision: "main@sha1:9f2c1a4",
    dependsOn: [],
  },
  fluxMetadata: { isReconciling: false, isSuspended: false, lastSyncAt: ago(3) },
});

// Flux controller deployments (children of the root kustomization).
for (const ctrl of ["source-controller", "kustomize-controller", "helm-controller", "notification-controller"]) {
  add({
    uid: uid("deploy"),
    name: ctrl,
    kind: "Deployment",
    group: G.APPS,
    namespace: "flux-system",
    parentIDs: [rootKs.uid],
    isFluxManaged: true,
    hasMetrics: true,
    deploymentMetadata: { replicas: 1, readyReplicas: 1, updatedReplicas: 1, availableReplicas: 1, images: [`ghcr.io/fluxcd/${ctrl}:v1.3.0`] },
  });
}

// ── Helper to build a HelmRelease → Deployment → ReplicaSet → Pods + Service ──
function buildApp({ name, namespace, chart, version, repo, status = "success", suspended = false, replicas = 2, image, parent, withNet = false, loadBalancer = false }) {
  const hr = add({
    uid: uid("hr"),
    name,
    kind: "HelmRelease",
    group: G.HELM,
    namespace,
    parentIDs: parent ? [parent.uid] : [],
    isFluxManaged: true,
    isReconcilable: true,
    fluxRole: "application",
    status: suspended ? "suspended" : status,
    conditions: [
      status === "failed"
        ? cond("Ready", false, "InstallFailed", "Helm install failed: timed out waiting for the condition")
        : status === "pending"
        ? cond("Ready", false, "Progressing", "Running 'upgrade' action")
        : cond("Ready", true, "InstallSucceeded", `Helm install succeeded for release ${namespace}/${name}.v${version}`),
    ],
    helmReleaseMetadata: {
      chartName: chart,
      chartVersion: version,
      sourceRef: { kind: "HelmRepository", name: repo },
    },
    fluxMetadata: { isReconciling: status === "pending", isSuspended: suspended, lastSyncAt: ago(8) },
  });

  if (suspended) return hr;

  const ready = status === "success" ? replicas : Math.max(0, replicas - 1);
  const deploy = add({
    uid: uid("deploy"),
    name,
    kind: "Deployment",
    group: G.APPS,
    namespace,
    parentIDs: [hr.uid],
    isFluxManaged: true,
    hasMetrics: true,
    status: status === "success" ? "success" : "warning",
    deploymentMetadata: { replicas, readyReplicas: ready, updatedReplicas: replicas, availableReplicas: ready, images: [image] },
  });

  const rs = add({
    uid: uid("rs"),
    name: `${name}-7d9f8c6b5`,
    kind: "ReplicaSet",
    group: G.APPS,
    namespace,
    parentIDs: [deploy.uid],
    isFluxManaged: true,
    status: deploy.status,
  });

  const podUids = [];
  const podLabels = { app: name, "app.kubernetes.io/name": name };
  for (let i = 0; i < replicas; i++) {
    const ok = i < ready;
    const pod = add({
      uid: uid("pod"),
      name: `${name}-7d9f8c6b5-${Math.random().toString(36).slice(2, 7)}`,
      kind: "Pod",
      group: G.CORE,
      namespace,
      parentIDs: [rs.uid],
      isFluxManaged: true,
      hasMetrics: true,
      labels: podLabels,
      status: ok ? "success" : "pending",
      podMetadata: {
        phase: ok ? "Running" : "Pending",
        image,
        containers: [
          { name, image, ready: ok, started: ok, restartCount: ok ? 0 : 3, state: ok ? "running" : "waiting", reason: ok ? undefined : "CrashLoopBackOff", isInit: false },
        ],
      },
    });
    podUids.push(pod.uid);
  }

  if (withNet) {
    const svc = add({
      uid: uid("svc"),
      name,
      kind: "Service",
      group: G.CORE,
      namespace,
      parentIDs: [hr.uid],
      isFluxManaged: true,
      serviceMetadata: {
        type: loadBalancer ? "LoadBalancer" : "ClusterIP",
        clusterIPs: ["10.96.42.10"],
        externalIPs: loadBalancer ? ["192.168.1.240"] : [],
        selector: { app: name },
        ports: [{ name: "http", protocol: "TCP", port: 80, targetPort: "8080", nodePort: loadBalancer ? 31380 : undefined }],
      },
    });
    add({
      uid: uid("eps"),
      name: `${name}-abcde`,
      kind: "EndpointSlice",
      group: G.DISCOVERY,
      namespace,
      parentIDs: [svc.uid],
      isFluxManaged: true,
      endpointSliceMetadata: {
        serviceName: name,
        endpoints: podUids.map((u, i) => ({ targetKind: "Pod", targetName: `${name}-pod-${i}`, targetUID: u, ready: i < ready })),
      },
    });
  }

  return hr;
}

// ── Application kustomizations (the app layer) ────────────────────────────────
function buildKs(name, status = "success") {
  return add({
    uid: uid("ks"),
    name,
    kind: "Kustomization",
    group: G.KUSTOMIZE,
    namespace: "flux-system",
    parentIDs: [rootKs.uid],
    isFluxManaged: true,
    isReconcilable: true,
    fluxRole: "application",
    status,
    conditions: [
      status === "success"
        ? cond("Ready", true, "ReconciliationSucceeded", "Applied revision: main@sha1:9f2c1a4")
        : cond("Ready", false, "BuildFailed", "kustomize build failed: accumulating resources"),
    ],
    kustomizationMetadata: {
      path: `./apps/${name}`,
      sourceRef: { kind: "GitRepository", name: "flux-system" },
      lastAppliedRevision: "main@sha1:9f2c1a4",
      lastAttemptedRevision: "main@sha1:9f2c1a4",
      dependsOn: name === "apps" ? ["infrastructure"] : [],
    },
    fluxMetadata: { isReconciling: false, isSuspended: false, lastSyncAt: ago(4) },
  });
}

const infraKs = buildKs("infrastructure");
const appsKs = buildKs("apps");
const monitoringKs = buildKs("monitoring");

// ── Repositories (sources) ────────────────────────────────────────────────────
for (const [name, url] of [
  ["bitnami", "https://charts.bitnami.com/bitnami"],
  ["ingress-nginx", "https://kubernetes.github.io/ingress-nginx"],
  ["jetstack", "https://charts.jetstack.io"],
  ["prometheus-community", "https://prometheus-community.github.io/helm-charts"],
  ["podinfo", "https://stefanprodan.github.io/podinfo"],
]) {
  add({
    uid: uid("helmrepo"),
    name,
    kind: "HelmRepository",
    group: G.SOURCE,
    namespace: "flux-system",
    isFluxManaged: true,
    isReconcilable: true,
    fluxRole: "repository",
    conditions: [cond("Ready", true, "Succeeded", `stored artifact for revision 'sha256:${name}'`)],
    helmRepositoryMetadata: { url },
    fluxMetadata: { isReconciling: false, isSuspended: false, lastSyncAt: ago(15) },
  });
}
add({
  uid: uid("ocirepo"),
  name: "podinfo-oci",
  kind: "OCIRepository",
  group: G.SOURCE,
  namespace: "flux-system",
  isFluxManaged: true,
  isReconcilable: true,
  fluxRole: "repository",
  conditions: [cond("Ready", true, "Succeeded", "stored artifact for digest")],
  ociRepositoryMetadata: { url: "oci://ghcr.io/stefanprodan/manifests/podinfo", digest: "sha256:3b2c…", tag: "6.7.0", semver: ">=6.0.0", semverFilter: "" },
  fluxMetadata: { isReconciling: false, isSuspended: false, lastSyncAt: ago(20) },
});

// ── Infrastructure apps ───────────────────────────────────────────────────────
buildApp({ name: "ingress-nginx", namespace: "ingress-nginx", chart: "ingress-nginx", version: "4.11.2", repo: "ingress-nginx", parent: infraKs, replicas: 2, image: "registry.k8s.io/ingress-nginx/controller:v1.11.2", withNet: true, loadBalancer: true });
buildApp({ name: "cert-manager", namespace: "cert-manager", chart: "cert-manager", version: "1.15.3", repo: "jetstack", parent: infraKs, replicas: 1, image: "quay.io/jetstack/cert-manager-controller:v1.15.3" });
buildApp({ name: "metallb", namespace: "metallb-system", chart: "metallb", version: "0.14.8", repo: "bitnami", parent: infraKs, replicas: 1, image: "quay.io/metallb/controller:v0.14.8" });
buildApp({ name: "longhorn", namespace: "longhorn-system", chart: "longhorn", version: "1.7.1", repo: "bitnami", parent: infraKs, status: "pending", replicas: 3, image: "longhornio/longhorn-manager:v1.7.1" });
buildApp({ name: "external-dns", namespace: "networking", chart: "external-dns", version: "8.3.5", repo: "bitnami", parent: infraKs, suspended: true, replicas: 1, image: "registry.k8s.io/external-dns/external-dns:v0.15.0" });

// ── Application apps ──────────────────────────────────────────────────────────
buildApp({ name: "podinfo", namespace: "podinfo", chart: "podinfo", version: "6.7.0", repo: "podinfo", parent: appsKs, replicas: 3, image: "ghcr.io/stefanprodan/podinfo:6.7.0", withNet: true, loadBalancer: true });
buildApp({ name: "redis", namespace: "podinfo", chart: "redis", version: "20.1.0", repo: "bitnami", parent: appsKs, replicas: 1, image: "docker.io/bitnami/redis:7.4.0", withNet: true });
buildApp({ name: "nextcloud", namespace: "nextcloud", chart: "nextcloud", version: "6.6.2", repo: "bitnami", parent: appsKs, replicas: 2, image: "docker.io/bitnami/nextcloud:30.0.0", withNet: true });
buildApp({ name: "postgresql", namespace: "nextcloud", chart: "postgresql", version: "16.0.0", repo: "bitnami", parent: appsKs, replicas: 1, image: "docker.io/bitnami/postgresql:16.4.0" });
buildApp({ name: "paperless-ngx", namespace: "documents", chart: "paperless-ngx", version: "0.23.0", repo: "bitnami", parent: appsKs, status: "failed", replicas: 1, image: "ghcr.io/paperless-ngx/paperless-ngx:2.12.0" });
buildApp({ name: "homepage", namespace: "homepage", chart: "homepage", version: "2.0.1", repo: "bitnami", parent: appsKs, replicas: 1, image: "ghcr.io/gethomepage/homepage:v0.9.10", withNet: true });
buildApp({ name: "jellyfin", namespace: "media", chart: "jellyfin", version: "2.1.0", repo: "bitnami", parent: appsKs, replicas: 1, image: "docker.io/jellyfin/jellyfin:10.9.11" });

// ── Monitoring ────────────────────────────────────────────────────────────────
buildApp({ name: "kube-prometheus-stack", namespace: "monitoring", chart: "kube-prometheus-stack", version: "62.3.0", repo: "prometheus-community", parent: monitoringKs, replicas: 1, image: "quay.io/prometheus/prometheus:v2.54.1" });
buildApp({ name: "loki", namespace: "monitoring", chart: "loki", version: "6.10.0", repo: "prometheus-community", parent: monitoringKs, replicas: 1, image: "docker.io/grafana/loki:3.1.1" });
buildApp({ name: "grafana", namespace: "monitoring", chart: "grafana", version: "8.4.7", repo: "prometheus-community", parent: monitoringKs, replicas: 1, image: "docker.io/grafana/grafana:11.2.0", withNet: true, loadBalancer: true });

export const mockResources = resources;
const findHr = (name) => resources.find((r) => r.name === name && r.kind === "HelmRelease").uid;
export const ids = {
  rootKs: rootKs.uid,
  appsKs: appsKs.uid,
  podinfo: findHr("podinfo"),
  paperless: findHr("paperless-ngx"),
};
