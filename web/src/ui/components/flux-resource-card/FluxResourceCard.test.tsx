import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import App from "./FluxResourceCard";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { kustomization } from "../../../test/fixtures";
import { FluxResource } from "../../../core/fluxTree/models/tree";

describe("FluxResourceCard (App)", () => {
  it("renders name, kind/namespace and the last-sync row", () => {
    const ks = kustomization({ name: "my-app", namespace: "default" }) as unknown as FluxResource;
    renderWithProviders(<App node={ks} />);
    expect(screen.getByText("my-app")).toBeInTheDocument();
    expect(screen.getByText(/Kustomization · default/)).toBeInTheDocument();
    expect(screen.getByText("Last sync")).toBeInTheDocument();
  });

  it("shows a suspended indicator and a usage row when metrics are present", () => {
    const c = makeTestContainer();
    const metrics = c.get(MetricsStore);
    metrics.applyStatus({ name: "p", status: "active" });
    const ks = kustomization({ uid: "u-app", name: "app", fluxMetadata: { isReconciling: false, isSuspended: true } }) as unknown as FluxResource;
    metrics.applyCurrent({ "u-app": { cpu: [{ t: 1, v: 0.5 }], memory: [{ t: 1, v: 1024 }], spec: { cpu: { requests: null, limits: null }, memory: { requests: null, limits: null } } } });

    renderWithProviders(<App node={ks} />, { container: c });
    expect(screen.getByText("Usage")).toBeInTheDocument();
  });

  it("renders the Source revision row for a Kustomization with a resolvable repo", () => {
    const c = makeTestContainer();
    const store = c.get(FluxTreeStore);
    store.syncResources([{
      uid: "repo", name: "repo", kind: "GitRepository", group: "source.toolkit.fluxcd.io",
      annotations: {}, labels: {}, conditions: [], status: "success", isFluxManaged: true, isReconcilable: true, hasMetrics: false, fluxRole: "repository",
      createdAt: "2026-01-01T00:00:00Z",
      gitRepositoryMetadata: { url: "https://github.com/org/repo.git", branch: "main", tag: "", semver: "", name: "", commit: "" },
    } as never]);
    const ks = kustomization({
      name: "app",
      kustomizationMetadata: { path: "./", sourceRef: { kind: "GitRepository", name: "repo" }, lastAppliedRevision: "", lastAttemptedRevision: "main@sha1:deadbeef", dependsOn: [] },
    }) as unknown as FluxResource;

    renderWithProviders(<App node={ks} />, { container: c });
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Revision")).toBeInTheDocument();
  });
});
