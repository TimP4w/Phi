import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommandPalette from "./CommandPalette";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { TYPES } from "../../../core/shared/types";
import { makeDto } from "../../../test/fixtures";

const openPalette = () => fireEvent.keyDown(window, { key: "k", metaKey: true });

const populated = () => {
  const c = makeTestContainer();
  const store = c.get(FluxTreeStore);
  store.syncResources([
    makeDto({ uid: "ks", kind: "Kustomization", group: "kustomize.toolkit.fluxcd.io", name: "my-app", namespace: "flux-system", fluxRole: "application" }),
    makeDto({ uid: "pod", kind: "Pod", name: "web-pod", namespace: "default", status: "failed" }),
  ]);
  return c;
};

describe("CommandPalette", () => {
  it("is hidden until the keyboard shortcut opens it", () => {
    renderWithProviders(<CommandPalette />);
    expect(screen.queryByPlaceholderText(/Search resources/)).not.toBeInTheDocument();
    openPalette();
    expect(screen.getByPlaceholderText(/Search resources/)).toBeInTheDocument();
  });

  it("suggests filter prefixes as the user types", async () => {
    renderWithProviders(<CommandPalette />, { container: populated() });
    openPalette();
    await userEvent.type(screen.getByPlaceholderText(/Search resources/), "kind:");
    expect(screen.getByText("kind:Pod")).toBeInTheDocument();
  });

  it("lists resources matching a free-text search", async () => {
    renderWithProviders(<CommandPalette />, { container: populated() });
    openPalette();
    await userEvent.type(screen.getByPlaceholderText(/Search resources/), "web-pod");
    expect(screen.getByText("web-pod")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    renderWithProviders(<CommandPalette />, { container: populated() });
    openPalette();
    const input = screen.getByPlaceholderText(/Search resources/);
    await userEvent.type(input, "{Escape}");
    expect(screen.queryByPlaceholderText(/Search resources/)).not.toBeInTheDocument();
  });

  it("runs a command against an eligible resource", async () => {
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const c = populated();
    c.rebind(TYPES.ReconcileUseCase).toConstantValue({ execute: reconcile });
    renderWithProviders(<CommandPalette />, { container: c });
    openPalette();
    await userEvent.type(screen.getByPlaceholderText(/Search resources/), "reconcile ");
    // The flux Kustomization is an eligible reconcile target.
    await userEvent.click(screen.getByText("my-app"));
    expect(reconcile).toHaveBeenCalledWith("ks");
  });
});
