import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppsView from "./Dashboard.view";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { makeDto } from "../../../test/fixtures";

// The sidebar's default open state is decided by a matchMedia("(min-width: 1024px)")
// probe; report it unmatched to exercise the mobile (collapsed) default.
const realMatchMedia = window.matchMedia;
function forceMobile() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const populated = () => {
  const c = makeTestContainer();
  c.get(FluxTreeStore).syncResources([
    makeDto({ uid: "a", kind: "Kustomization", group: "kustomize.toolkit.fluxcd.io", name: "alpha", namespace: "flux-system", fluxRole: "application" }),
    makeDto({ uid: "b", kind: "HelmRelease", group: "helm.toolkit.fluxcd.io", name: "bravo", namespace: "flux-system", fluxRole: "application" }),
    makeDto({ uid: "r", kind: "GitRepository", group: "source.toolkit.fluxcd.io", name: "repo", namespace: "flux-system", fluxRole: "repository" }),
  ]);
  return c;
};

describe("AppsView (Dashboard)", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it("renders the applications heading and the app cards", () => {
    renderWithProviders(<AppsView />, { container: populated() });
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("bravo")).toBeInTheDocument();
  });

  it("filters the cards by the search box", async () => {
    renderWithProviders(<AppsView />, { container: populated() });
    await userEvent.type(screen.getByPlaceholderText("Search by name…"), "alpha");
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("bravo")).not.toBeInTheDocument();
  });

  it("toggles the cluster sidebar", async () => {
    renderWithProviders(<AppsView />, { container: populated() });
    // Desktop default opens the sidebar, so the toggle collapses it.
    await userEvent.click(screen.getByLabelText("Collapse sidebar"));
    expect(screen.getByLabelText("Expand sidebar")).toBeInTheDocument();
  });

  it("starts with the sidebar collapsed on mobile", () => {
    forceMobile();
    renderWithProviders(<AppsView />, { container: populated() });
    expect(screen.getByLabelText("Expand sidebar")).toBeInTheDocument();
  });
});
