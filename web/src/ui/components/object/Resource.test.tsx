import { ComponentProps } from "react";
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import Resource from "./Resource";
import Pod from "./Pod";
import Deployment from "./Deployment";
import { renderWithProviders } from "../../../test/render";
import { makeDto } from "../../../test/fixtures";
import {
  Deployment as DeploymentModel,
  Pod as PodModel,
  HelmRelease,
  Kustomization,
  GitRepository,
  OCIRepository,
  PersistentVolumeClaim,
  PersistentVolume,
  KubeResource,
} from "../../../core/fluxTree/models/tree";

const node = (treeNode: KubeResource) =>
  ({ data: { treeNode } }) as unknown as ComponentProps<typeof Resource>;

describe("Resource node renderer", () => {
  it("renders a Deployment's replica summary", () => {
    const d = new DeploymentModel(makeDto({ kind: "Deployment", name: "web",
      deploymentMetadata: { replicas: 3, readyReplicas: 2, updatedReplicas: 2, availableReplicas: 2, images: [] } }));
    renderWithProviders(<Resource {...node(d)} />);
    expect(screen.getByText("2/3 replicas")).toBeInTheDocument();
  });

  it("renders a Pod's phase and deduplicated image basenames", () => {
    const p = new PodModel(makeDto({ kind: "Pod", name: "web",
      podMetadata: { phase: "Running", image: "", containers: [
        { name: "a", image: "registry/org/app:1", ready: true, started: true, restartCount: 0, state: "Running" },
        { name: "b", image: "registry/org/app:1", ready: true, started: true, restartCount: 0, state: "Running" },
      ] } }));
    renderWithProviders(<Resource {...node(p)} />);
    expect(screen.getByText(/Running/)).toBeInTheDocument();
    expect(screen.getByText(/app:1/)).toBeInTheDocument();
  });

  it("renders a HelmRelease's chart, version and source", () => {
    const hr = new HelmRelease(makeDto({ kind: "HelmRelease", name: "app",
      helmReleaseMetadata: { chartName: "mychart", chartVersion: "1.0.0", sourceRef: { kind: "HelmRepository", name: "repo" } } }));
    renderWithProviders(<Resource {...node(hr)} />);
    expect(screen.getByText(/mychart v1.0.0 ← repo/)).toBeInTheDocument();
  });

  it("renders a Kustomization's source/path/revision", () => {
    const ks = new Kustomization(makeDto({ kind: "Kustomization", name: "app",
      kustomizationMetadata: { path: "./apps", sourceRef: { kind: "GitRepository", name: "repo" }, lastAppliedRevision: "", lastAttemptedRevision: "main@sha1:abcdef1234", dependsOn: [] } }));
    renderWithProviders(<Resource {...node(ks)} />);
    expect(screen.getByText(/repo · \.\/apps/)).toBeInTheDocument();
  });

  it("renders a GitRepository's url and ref", () => {
    const git = new GitRepository(makeDto({ kind: "GitRepository", name: "repo",
      gitRepositoryMetadata: { url: "https://github.com/org/repo.git", branch: "main", tag: "", semver: "", name: "", commit: "" } }));
    renderWithProviders(<Resource {...node(git)} />);
    expect(screen.getByText(/github.com\/org\/repo@main/)).toBeInTheDocument();
  });

  it("renders an OCIRepository's url and ref", () => {
    const oci = new OCIRepository(makeDto({ kind: "OCIRepository", name: "repo",
      ociRepositoryMetadata: { url: "oci://ghcr.io/org/repo", digest: "", tag: "v1", semver: "", semverFilter: "" } }));
    renderWithProviders(<Resource {...node(oci)} />);
    expect(screen.getByText(/ghcr.io\/org\/repo:v1/)).toBeInTheDocument();
  });

  it("renders a PVC's phase, class, capacity and access mode shorthand", () => {
    const pvc = new PersistentVolumeClaim(makeDto({ kind: "PersistentVolumeClaim", name: "data",
      pvcMetadata: { storageClass: "fast", volumeName: "v", volumeMode: "Filesystem", accessModes: ["ReadWriteOnce"], capacity: { storage: "10Gi" }, phase: "Bound" } }));
    renderWithProviders(<Resource {...node(pvc)} />);
    expect(screen.getByText(/Bound · fast · 10Gi · RWO/)).toBeInTheDocument();
  });

  it("renders a PV's phase, formatted capacity and nfs driver", () => {
    const pv = new PersistentVolume(makeDto({ kind: "PersistentVolume", name: "vol",
      pvMetadata: { phase: "Bound", capacity: 1024 * 1024 * 1024, nfsServer: "10.0.0.1", nfsShare: "/data" } }));
    renderWithProviders(<Resource {...node(pv)} />);
    expect(screen.getByText(/Bound · 1.0Gi · nfs/)).toBeInTheDocument();
  });

  it("shows a Paused badge and failure message for a suspended/failed resource", () => {
    const ks = new Kustomization(makeDto({ kind: "Kustomization", name: "app", status: "failed",
      fluxMetadata: { isReconciling: false, isSuspended: true },
      conditions: [{ type: "Ready", status: "False", message: "apply failed", reason: "Err", lastTransitionTime: "2026-01-01T00:00:00Z" }] }));
    renderWithProviders(<Resource {...node(ks)} />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.getByText("apply failed")).toBeInTheDocument();
  });

  it("renders no footer for a plain healthy resource", () => {
    const r = new KubeResource(makeDto({ kind: "ConfigMap", name: "cm", status: "success" }));
    renderWithProviders(<Resource {...node(r)} />);
    expect(screen.getByText("cm")).toBeInTheDocument();
  });
});

describe("Pod and Deployment wrappers", () => {
  it("delegate to the Resource renderer", () => {
    const p = new PodModel(makeDto({ kind: "Pod", name: "pod-x" }));
    const d = new DeploymentModel(makeDto({ kind: "Deployment", name: "dep-x" }));
    const { unmount } = renderWithProviders(<Pod {...node(p)} />);
    expect(screen.getByText("pod-x")).toBeInTheDocument();
    unmount();
    renderWithProviders(<Deployment {...node(d)} />);
    expect(screen.getByText("dep-x")).toBeInTheDocument();
  });
});
