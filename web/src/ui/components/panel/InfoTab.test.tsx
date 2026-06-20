import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { InfoTab, ContainerRow, StorageRollup } from "./InfoTab";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { makeDto } from "../../../test/fixtures";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import {
  Kustomization,
  HelmRelease,
  Deployment,
  Pod,
  PersistentVolumeClaim,
  PersistentVolume,
  LonghornVolume,
  KubeResource,
  Container,
} from "../../../core/fluxTree/models/tree";

const container = (over: Partial<Container>): Container => ({
  name: "c", image: "img:1", ready: false, started: false, restartCount: 0, state: "Running", ...over,
});

describe("InfoTab", () => {
  it("shows a placeholder when no resource is selected", () => {
    renderWithProviders(<InfoTab resource={null} />);
    expect(screen.getByText("No resource selected.")).toBeInTheDocument();
  });

  it("renders identity, status, and labels/annotations", () => {
    const r = new KubeResource(makeDto({ name: "web", kind: "ConfigMap", namespace: "ns", labels: { app: "web" }, annotations: { note: "x" } }));
    renderWithProviders(<InfoTab resource={r} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Labels")).toBeInTheDocument();
    expect(screen.getByText("Annotations")).toBeInTheDocument();
  });

  it("renders Kustomization fields and flags drift", () => {
    const ks = new Kustomization(makeDto({ kind: "Kustomization",
      kustomizationMetadata: { path: "./apps", sourceRef: { kind: "GitRepository", name: "r" }, lastAppliedRevision: "a", lastAttemptedRevision: "b", dependsOn: [] } }));
    renderWithProviders(<InfoTab resource={ks} />);
    expect(screen.getByText("./apps")).toBeInTheDocument();
    expect(screen.getByText("Applied Revision")).toBeInTheDocument();
  });

  it("renders HelmRelease fields", () => {
    const hr = new HelmRelease(makeDto({ kind: "HelmRelease",
      helmReleaseMetadata: { chartName: "ch", chartVersion: "1.0", sourceRef: { kind: "HelmRepository", name: "r" } } }));
    renderWithProviders(<InfoTab resource={hr} />);
    expect(screen.getByText("ch")).toBeInTheDocument();
    expect(screen.getByText("r (HelmRepository)")).toBeInTheDocument();
  });

  it("renders Deployment fields with image chips", () => {
    const d = new Deployment(makeDto({ kind: "Deployment",
      deploymentMetadata: { replicas: 2, readyReplicas: 2, updatedReplicas: 2, availableReplicas: 2, images: ["img:1"] } }));
    renderWithProviders(<InfoTab resource={d} />);
    expect(screen.getByText("Replicas")).toBeInTheDocument();
    expect(screen.getByText("img:1")).toBeInTheDocument();
  });

  it("renders Pod fields with deduplicated images", () => {
    const p = new Pod(makeDto({ kind: "Pod", podMetadata: { phase: "Running", image: "",
      containers: [container({ image: "img:1" }), container({ image: "img:1" })] } }));
    renderWithProviders(<InfoTab resource={p} />);
    expect(screen.getByText("Phase")).toBeInTheDocument();
    expect(screen.getByText("img:1")).toBeInTheDocument();
  });

  it("renders PVC fields", () => {
    const pvc = new PersistentVolumeClaim(makeDto({ kind: "PersistentVolumeClaim",
      pvcMetadata: { storageClass: "fast", volumeName: "v", volumeMode: "Filesystem", accessModes: ["ReadWriteOnce"], capacity: {}, phase: "Bound", requested: 1024 } }));
    renderWithProviders(<InfoTab resource={pvc} hideStorage />);
    expect(screen.getByText("Storage Class")).toBeInTheDocument();
    expect(screen.getByText("fast")).toBeInTheDocument();
  });

  it("renders PV fields", () => {
    const pv = new PersistentVolume(makeDto({ kind: "PersistentVolume",
      pvMetadata: { phase: "Bound", capacity: 2048, storageClass: "fast", driver: "csi", accessModes: ["ReadWriteOnce"] } }));
    renderWithProviders(<InfoTab resource={pv} hideStorage />);
    expect(screen.getByText("Reclaim Policy")).toBeInTheDocument();
  });

  it("renders Longhorn Volume usage and robustness", () => {
    const vol = new LonghornVolume(makeDto({ kind: "Volume", group: "longhorn.io",
      longhornVolumeMetadata: { state: "attached", robustness: "healthy", size: 1000, actualSize: 500, numberOfReplicas: 3, nodeID: "n1", frontend: "blockdev", accessMode: "rwo" } }));
    renderWithProviders(<InfoTab resource={vol} hideStorage />);
    expect(screen.getByText("healthy")).toBeInTheDocument();
    expect(screen.getByText("Robustness")).toBeInTheDocument();
  });
});

describe("ContainerRow", () => {
  it("renders an init container badge, restart count and exit code", () => {
    renderWithProviders(<ContainerRow container={container({ name: "init-db", isInit: true, state: "Terminated", exitCode: 0, restartCount: 2 })} />);
    expect(screen.getByText("init")).toBeInTheDocument();
    expect(screen.getByText("init-db")).toBeInTheDocument();
    expect(screen.getByText("Restarts: 2")).toBeInTheDocument();
    expect(screen.getByText("Exit: 0")).toBeInTheDocument();
  });

  it("shows the failure message and ready state", () => {
    renderWithProviders(<ContainerRow container={container({ ready: true, message: "OOMKilled" })} />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("OOMKilled")).toBeInTheDocument();
  });
});

describe("StorageRollup", () => {
  const withPvc = (requested?: number) => {
    const ks = new Kustomization(makeDto({ uid: "ks", kind: "Kustomization" }));
    ks.children = [new PersistentVolumeClaim(makeDto({ uid: "pvc", kind: "PersistentVolumeClaim",
      pvcMetadata: { storageClass: "s", volumeName: "v", volumeMode: "Filesystem", accessModes: [], capacity: {}, phase: "Bound", requested } }))];
    return ks;
  };

  it("renders nothing when the subtree owns no PVCs", () => {
    const { container: dom } = renderWithProviders(<StorageRollup resource={new Kustomization(makeDto({ kind: "Kustomization" }))} />);
    expect(dom.textContent).toBe("");
  });

  it("shows requested storage and 'Prometheus off' when no usage exists", () => {
    renderWithProviders(<StorageRollup resource={withPvc(1024)} />);
    expect(screen.getByText("Requested")).toBeInTheDocument();
    expect(screen.getByText("Prometheus off")).toBeInTheDocument();
  });

  it("shows measured usage when Prometheus reports it", () => {
    const c = makeTestContainer();
    const metrics = c.get(MetricsStore);
    metrics.applyStatus({ name: "p", status: "active" });
    metrics.applyStorage({ ks: { requested: 1024, used: 512, pvcCount: 1, measured: 1 } });
    renderWithProviders(<StorageRollup resource={withPvc(1024)} />, { container: c });
    expect(screen.getByText("Used")).toBeInTheDocument();
  });
});
