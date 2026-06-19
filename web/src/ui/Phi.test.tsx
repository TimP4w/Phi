import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import Phi from "./Phi";
import { renderWithProviders, makeTestContainer } from "../test/render";
import { FluxTreeStore } from "../core/fluxTree/stores/fluxTree.store";
import { makeDto } from "../test/fixtures";

describe("Phi app shell", () => {
  it("routes to the dashboard at the root path", () => {
    const c = makeTestContainer();
    c.get(FluxTreeStore).syncResources([
      makeDto({ uid: "a", kind: "Kustomization", group: "kustomize.toolkit.fluxcd.io", name: "alpha", namespace: "flux-system", fluxRole: "application" }),
    ]);
    renderWithProviders(<Phi />, { container: c, route: "/" });
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
  });
});
