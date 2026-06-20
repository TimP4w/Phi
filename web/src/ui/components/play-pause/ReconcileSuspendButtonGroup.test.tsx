import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReconcileSuspendButtonGroup from "./ReconcileSuspendButtonGroup";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { TYPES } from "../../../core/shared/types";
import { kustomization } from "../../../test/fixtures";
import { FluxResource } from "../../../core/fluxTree/models/tree";

const containerWith = (recon = vi.fn().mockResolvedValue(undefined), susp = vi.fn().mockResolvedValue(undefined), res = vi.fn().mockResolvedValue(undefined)) => {
  const c = makeTestContainer();
  c.rebind(TYPES.ReconcileUseCase).toConstantValue({ execute: recon });
  c.rebind(TYPES.SuspendUseCase).toConstantValue({ execute: susp });
  c.rebind(TYPES.ResumeUseCase).toConstantValue({ execute: res });
  return { c, recon, susp, res };
};

describe("ReconcileSuspendButtonGroup", () => {
  it("triggers reconcile on the full button", async () => {
    const { c, recon } = containerWith();
    const ks = kustomization({ fluxMetadata: { isReconciling: false, isSuspended: false } }) as unknown as FluxResource;
    renderWithProviders(<ReconcileSuspendButtonGroup resource={ks} />, { container: c });
    await userEvent.click(screen.getByText("Reconcile"));
    expect(recon).toHaveBeenCalledWith(ks.uid);
  });

  it("suspends an active resource, then shows Resume", async () => {
    const { c, susp } = containerWith();
    const ks = kustomization({ fluxMetadata: { isReconciling: false, isSuspended: false } }) as unknown as FluxResource;
    renderWithProviders(<ReconcileSuspendButtonGroup resource={ks} />, { container: c });
    await userEvent.click(screen.getByText("Suspend"));
    expect(susp).toHaveBeenCalledWith(ks.uid);
    await waitFor(() => expect(screen.getByText("Resume")).toBeInTheDocument());
  });

  it("resumes a suspended resource", async () => {
    const { c, res } = containerWith();
    const ks = kustomization({ fluxMetadata: { isReconciling: false, isSuspended: true } }) as unknown as FluxResource;
    renderWithProviders(<ReconcileSuspendButtonGroup resource={ks} />, { container: c });
    await userEvent.click(screen.getByText("Resume"));
    expect(res).toHaveBeenCalledWith(ks.uid);
  });

  it("renders icon-only buttons in compact mode", async () => {
    const { c, recon } = containerWith();
    const ks = kustomization({ fluxMetadata: { isReconciling: false, isSuspended: false } }) as unknown as FluxResource;
    renderWithProviders(<ReconcileSuspendButtonGroup resource={ks} compact />, { container: c });
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    await userEvent.click(buttons[0]);
    expect(recon).toHaveBeenCalled();
  });
});
