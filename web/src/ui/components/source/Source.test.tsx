import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import Source from "./Source";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { kustomization, helmRelease, kubeResource } from "../../../test/fixtures";
import { makeDto } from "../../../test/fixtures";

describe("Source", () => {
  it("renders a Helm release's chart version", () => {
    const hr = helmRelease({
      helmReleaseMetadata: { chartName: "app", chartVersion: "1.2.3", sourceRef: { kind: "HelmRepository", name: "r" } },
    });
    renderWithProviders(<Source fluxResource={hr} />);
    expect(screen.getByText("1.2.3")).toBeInTheDocument();
  });

  it("renders a commit link for a Kustomization with a resolvable source", () => {
    const container = makeTestContainer();
    const store = container.get(FluxTreeStore);
    store.syncResources([
      makeDto({ uid: "repo", kind: "GitRepository", group: "source.toolkit.fluxcd.io", name: "repo", fluxRole: "repository",
        gitRepositoryMetadata: { url: "git@github.com:org/repo.git", branch: "main", tag: "", semver: "", name: "", commit: "" } }),
    ]);
    const ks = kustomization({
      kustomizationMetadata: { path: "./", sourceRef: { kind: "GitRepository", name: "repo" }, lastAppliedRevision: "", lastAttemptedRevision: "main@sha1:deadbeefcafe", dependsOn: [] },
    });

    renderWithProviders(<Source fluxResource={ks} />, { container });

    const link = screen.getByRole("link");
    // The URL is derived by stripping everything up to the "@" of the git ref.
    expect(link).toHaveAttribute("href", "https://github.com:org/repo.git/commit/deadbeefcafe");
    expect(screen.getByText(/deadbeef/)).toBeInTheDocument();
  });

  it("renders nothing for a Kustomization whose source cannot be resolved", () => {
    const ks = kustomization({
      kustomizationMetadata: { path: "./", sourceRef: { kind: "GitRepository", name: "missing" }, lastAppliedRevision: "", lastAttemptedRevision: "", dependsOn: [] },
    });
    const { container: dom } = renderWithProviders(<Source fluxResource={ks} />);
    expect(dom.textContent).toBe("");
  });

  it("renders nothing for an unrelated kind", () => {
    const { container: dom } = renderWithProviders(<Source fluxResource={kubeResource({ kind: "ConfigMap" })} />);
    expect(dom.textContent).toBe("");
  });
});
