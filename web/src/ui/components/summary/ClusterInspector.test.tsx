import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClusterInspector from "./ClusterInspector";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { EventsStore } from "../../../core/fluxTree/stores/events.store";
import { TreeNodeDto } from "../../../core/fluxTree/models/dtos/treeDto";
import { FLUX_NAMESPACE } from "../../../core/fluxTree/constants/resources.const";
import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";

const dto = (over: Partial<TreeNodeDto>): TreeNodeDto => ({
  uid: "x", name: "res", kind: "ConfigMap", annotations: {}, labels: {}, conditions: [],
  status: "success", isFluxManaged: false, isReconcilable: false, hasMetrics: false,
  createdAt: "2026-01-01T00:00:00Z", ...over,
} as TreeNodeDto);

const richStore = () => {
  const c = makeTestContainer();
  const store = c.get(FluxTreeStore);
  store.syncResources([
    dto({ uid: "root", kind: "Kustomization", group: "kustomize.toolkit.fluxcd.io", name: FLUX_NAMESPACE, namespace: FLUX_NAMESPACE, fluxRole: "application" }),
    dto({ uid: "app2", kind: "HelmRelease", group: "helm.toolkit.fluxcd.io", name: "app2", parentIDs: ["root"], fluxRole: "application", status: "failed" }),
    dto({ uid: "repo", kind: "GitRepository", group: "source.toolkit.fluxcd.io", name: "repo", parentIDs: ["root"], fluxRole: "repository" }),
    dto({ uid: "pod1", kind: "Pod", name: "pod1", namespace: "ns", parentIDs: ["root"], status: "success", podMetadata: { phase: "Running", image: "" } as never }),
    dto({ uid: "pod2", kind: "Pod", name: "pod2", namespace: "ns", parentIDs: ["root"], status: "failed", podMetadata: { phase: "CrashLoopBackOff", image: "" } as never }),
    dto({ uid: "node1", kind: "Node", name: "node1", conditions: [{ type: "Ready", status: "True", message: "", reason: "", lastTransitionTime: "2026-01-01T00:00:00Z" }], nodeMetadata: { internalIP: "10.0.0.1" } as never }),
    dto({ uid: "pvc1", kind: "PersistentVolumeClaim", name: "pvc1", namespace: "ns", parentIDs: ["root"], pvcMetadata: { phase: "Bound", storageClass: "s", volumeName: "v", volumeMode: "F", accessModes: [], capacity: {}, requested: 1024 } as never }),
    dto({ uid: "pv1", kind: "PersistentVolume", name: "pv1", pvMetadata: { phase: "Bound", capacity: 2048 } as never }),
    dto({ uid: "lhv", kind: "Volume", group: "longhorn.io", name: "lhv", longhornVolumeMetadata: { state: "attached", robustness: "degraded", size: 1024, actualSize: 512, numberOfReplicas: 3, nodeID: "n1", frontend: "b", accessMode: "rwo" } as never }),
    dto({ uid: "lhn", kind: "Node", group: "longhorn.io", name: "lhn", longhornNodeMetadata: { ready: true, schedulable: true, storageMaximum: 1000, storageUsed: 400, storageReserved: 0, storageSchedulable: 600, storageDisabled: 0 } as never }),
    dto({ uid: "cert", kind: "Certificate", name: "cert", namespace: "ns", certificateMetadata: { secretName: "tls", ready: true, notAfter: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(), dnsNames: ["x.example.com"] } as never }),
    dto({ uid: "svc", kind: "Service", name: "svc", namespace: "ns", serviceMetadata: { type: "ClusterIP" } as never }),
    dto({ uid: "eps", kind: "EndpointSlice", name: "eps", namespace: "ns", endpointSliceMetadata: { serviceName: "svc", endpoints: [{ ready: false, targetUID: "pod1" }] } as never }),
    dto({ uid: "route", kind: "IngressRoute", name: "route", namespace: "ns", routeMetadata: { hostnames: ["x.example.com"] } as never }),
    dto({ uid: "np", kind: "NetworkPolicy", name: "np", namespace: "ns", networkPolicyMetadata: { podSelector: {} } as never }),
    dto({ uid: "report", kind: "VulnerabilityReport", name: "report", trivyMetadata: { reportType: "vulnerability", critical: 2, low: 1, targetKind: "Pod", targetName: "pod1", targetNamespace: "ns" } as never }),
    dto({ uid: "audit", kind: "ConfigAuditReport", name: "audit", trivyMetadata: { reportType: "configAudit", medium: 1, targetKind: "Pod", targetName: "pod1", targetNamespace: "ns" } as never }),
  ]);
  const events = c.get(EventsStore);
  events.setEvents([
    Object.assign(Object.create(KubeEvent.prototype), { uid: "e1", type: "Warning", reason: "BackOff", message: "m", name: "pod2", namespace: "ns", kind: "Pod", source: "kubelet", resourceUID: "pod2", lastObserved: new Date(), firstObserved: new Date(), count: 1 }),
  ]);
  const metrics = c.get(MetricsStore);
  metrics.applyStatus({ name: "p", status: "active" });
  metrics.applyNodes([{ node: "node1", cpu: { used: 1, capacity: 4, percent: 80 }, memory: { used: 1, capacity: 4, percent: 50 } }]);
  return c;
};

const fluxControllersStore = () => {
  const c = makeTestContainer();
  c.get(FluxTreeStore).syncResources([
    dto({ uid: "root", kind: "Kustomization", group: "kustomize.toolkit.fluxcd.io", name: FLUX_NAMESPACE, namespace: FLUX_NAMESPACE, fluxRole: "application" }),
    dto({ uid: "src", kind: "Deployment", name: "source-controller", namespace: FLUX_NAMESPACE, parentIDs: ["root"], labels: { "app.kubernetes.io/version": "v2.3.0" }, status: "success" }),
    dto({ uid: "kus", kind: "Deployment", name: "kustomize-controller", namespace: FLUX_NAMESPACE, parentIDs: ["root"], labels: { "app.kubernetes.io/version": "v2.3.0" }, status: "failed" }),
  ]);
  return c;
};

describe("ClusterInspector", () => {
  it("surfaces the Flux controllers in a FluxCD section", async () => {
    renderWithProviders(<ClusterInspector />, { container: fluxControllersStore() });
    expect(screen.getByText("FluxCD")).toBeInTheDocument();
    expect(screen.getByText("1 down")).toBeInTheDocument();
    await userEvent.click(screen.getByText("FluxCD"));
    expect(screen.getByText("source")).toBeInTheDocument();
    expect(screen.getByText("kustomize")).toBeInTheDocument();
    expect(screen.getAllByText("v2.3.0")).toHaveLength(2);
  });

  it("renders all the section headers for a populated cluster", () => {
    renderWithProviders(<ClusterInspector />, { container: richStore() });
    expect(screen.getByText("Cluster")).toBeInTheDocument();
    expect(screen.getByText("Reconciliation")).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
    expect(screen.getByText("Nodes")).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
  });

  it("expands each collapsible section to render its detail", async () => {
    renderWithProviders(<ClusterInspector />, { container: richStore() });
    for (const title of ["Nodes", "Storage", "Network", "Security", "Events"]) {
      const header = screen.queryByText(title);
      if (header) await userEvent.click(header);
    }
    // Expanded Nodes section offers an Inspect action; Storage shows the Longhorn block.
    expect(screen.getByText(/Inspect 1 node/)).toBeInTheDocument();
    expect(screen.getByText("Longhorn")).toBeInTheDocument();
  });

  it("opens the Longhorn volumes modal from the Storage section", async () => {
    renderWithProviders(<ClusterInspector />, { container: richStore() });
    await userEvent.click(screen.getByText("Storage"));
    await userEvent.click(screen.getByText(/View Longhorn volumes/));
    expect(screen.getByText("Longhorn Volumes")).toBeInTheDocument();
  });

  it("calls onClose from the mobile close button", async () => {
    const onClose = vi.fn();
    renderWithProviders(<ClusterInspector onClose={onClose} />, { container: richStore() });
    await userEvent.click(screen.getByLabelText("Close sidebar"));
    expect(onClose).toHaveBeenCalled();
  });
});
