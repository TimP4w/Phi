import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import Header from "./Header";
import FluxControllersHeader from "./FluxControllersHeader";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { makeDto } from "../../../test/fixtures";
import { FLUX_NAMESPACE, FLUX_VERSION_LABEL } from "../../../core/fluxTree/constants/resources.const";

describe("Header", () => {
  it("renders the brand and a children slot", () => {
    renderWithProviders(<Header><span>child-slot</span></Header>);
    expect(screen.getByText("Phi")).toBeInTheDocument();
    expect(screen.getByText("child-slot")).toBeInTheDocument();
  });
});

describe("FluxControllersHeader", () => {
  const containerWithControllers = () => {
    const c = makeTestContainer();
    const store = c.get(FluxTreeStore);
    store.syncResources([
      makeDto({ uid: "root", kind: "Kustomization", group: "kustomize.toolkit.fluxcd.io", name: FLUX_NAMESPACE, namespace: FLUX_NAMESPACE }),
      makeDto({ uid: "src", kind: "Deployment", group: "apps", name: "source-controller", namespace: FLUX_NAMESPACE, parentIDs: ["root"],
        labels: { [FLUX_VERSION_LABEL]: "v2.3.0" }, deploymentMetadata: { replicas: 1, readyReplicas: 1, updatedReplicas: 1, availableReplicas: 1, images: ["ghcr.io/fluxcd/source-controller:v1.2.3"] } }),
    ]);
    return c;
  };

  it("renders nothing when there are no flux controllers", () => {
    const { container: dom } = renderWithProviders(<FluxControllersHeader />);
    expect(dom.textContent).toBe("");
  });

  it("shows the detected flux version and a controller pill", () => {
    renderWithProviders(<FluxControllersHeader />, { container: containerWithControllers() });
    expect(screen.getByText("v2.3.0")).toBeInTheDocument();
    // "-controller" suffix is trimmed in the pill label.
    expect(screen.getByText("source")).toBeInTheDocument();
  });
});
