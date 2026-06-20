import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import ResourceView from "./Resource.view";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { makeDto } from "../../../test/fixtures";
import { FLUX_NAMESPACE } from "../../../core/fluxTree/constants/resources.const";

// The detail panel's default open state comes from a matchMedia("(min-width: 768px)")
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

const routedView = (
  <Routes>
    <Route path="/resource/:nodeUid/:view?" element={<ResourceView />} />
  </Routes>
);

const populated = () => {
  const c = makeTestContainer();
  c.get(FluxTreeStore).syncResources([
    makeDto({ uid: "root", kind: "Kustomization", group: "kustomize.toolkit.fluxcd.io", name: FLUX_NAMESPACE, namespace: FLUX_NAMESPACE }),
    makeDto({ uid: "app", kind: "Kustomization", group: "kustomize.toolkit.fluxcd.io", name: "my-app", namespace: FLUX_NAMESPACE, parentIDs: ["root"] }),
    makeDto({ uid: "pod", kind: "Pod", name: "web", namespace: "ns", parentIDs: ["app"] }),
  ]);
  return c;
};

describe("ResourceView", () => {
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it("renders the breadcrumb with the focused resource name", () => {
    renderWithProviders(routedView, { container: populated(), route: "/resource/app" });
    expect(screen.getAllByText("my-app").length).toBeGreaterThan(0);
    expect(screen.getByText("Cluster")).toBeInTheDocument();
  });

  it("switches to the tree view and lists the subtree", async () => {
    renderWithProviders(routedView, { container: populated(), route: "/resource/app" });
    // Responsive toolbars render a Tree button per breakpoint; click the first.
    await userEvent.click(screen.getAllByRole("button", { name: /Tree/ })[0]);
    expect(screen.getAllByText("my-app").length).toBeGreaterThan(0);
  });

  it("opens the network view directly from the URL segment", () => {
    const { container } = renderWithProviders(routedView, { container: populated(), route: "/resource/app/network" });
    expect(container.querySelector(".react-flow")).toBeInTheDocument();
  });

  it("starts with the detail panel collapsed on mobile", () => {
    forceMobile();
    renderWithProviders(routedView, { container: populated(), route: "/resource/app" });
    expect(screen.getByLabelText("Open details panel")).toBeInTheDocument();
    expect(screen.queryByLabelText("Close details panel")).not.toBeInTheDocument();
  });
});
