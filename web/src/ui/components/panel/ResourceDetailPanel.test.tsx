import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResourceDetailPanel from "./ResourceDetailPanel";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { TYPES } from "../../../core/shared/types";
import { makeDto } from "../../../test/fixtures";
import { Pod, Kustomization } from "../../../core/fluxTree/models/tree";

const podNode = () =>
  new Pod(makeDto({
    uid: "pod1", kind: "Pod", name: "web", namespace: "ns", status: "failed", hasMetrics: true,
    conditions: [{ type: "Ready", status: "False", message: "container crashed", reason: "CrashLoop", lastTransitionTime: "2026-01-01T00:00:00Z" }],
    podMetadata: { phase: "Running", image: "", containers: [
      { name: "main", image: "img:1", ready: false, started: true, restartCount: 3, state: "Waiting", reason: "CrashLoopBackOff" },
    ] } as never,
  }));

describe("ResourceDetailPanel", () => {
  it("prompts to select a resource when none is given", () => {
    renderWithProviders(<ResourceDetailPanel />);
    expect(screen.getByText("Select a resource to see its details.")).toBeInTheDocument();
  });

  it("renders a mobile close button and fires onClose", async () => {
    const onClose = vi.fn();
    renderWithProviders(<ResourceDetailPanel onClose={onClose} />);
    await userEvent.click(screen.getByLabelText("Close details"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the failing-condition alert for a failed Pod", () => {
    renderWithProviders(<ResourceDetailPanel node={podNode()} />);
    expect(screen.getByText("container crashed")).toBeInTheDocument();
  });

  it("exposes a Logs tab for a Pod and switches to it", async () => {
    const c = makeTestContainer();
    renderWithProviders(<ResourceDetailPanel node={podNode()} />, { container: c });
    await userEvent.click(screen.getByRole("tab", { name: "Logs" }));
    // The Logs tab renders (the pod isn't in the store cache, so it prompts).
    await waitFor(() => expect(screen.getByText("No pod selected")).toBeInTheDocument());
  });

  it("switches to the Describe tab and shows the empty definition", async () => {
    const c = makeTestContainer();
    c.rebind(TYPES.DescribeNodeUseCase).toConstantValue({ execute: vi.fn().mockResolvedValue("") });
    renderWithProviders(<ResourceDetailPanel node={podNode()} />, { container: c });
    await userEvent.click(screen.getByRole("tab", { name: "Describe" }));
    await waitFor(() => expect(screen.getByText("No resource definition")).toBeInTheDocument());
  });

  it("shows a revision-drift alert for a drifted Kustomization", () => {
    const ks = new Kustomization(makeDto({
      uid: "ks", kind: "Kustomization", name: "app", namespace: "flux-system",
      kustomizationMetadata: { path: "./", sourceRef: { kind: "GitRepository", name: "r" }, lastAppliedRevision: "main@sha1:aaaaaaa", lastAttemptedRevision: "main@sha1:bbbbbbb", dependsOn: [] },
    }));
    renderWithProviders(<ResourceDetailPanel node={ks} />);
    expect(screen.getByText("Revision drift")).toBeInTheDocument();
  });

  it("offers a Metrics tab when the resource has metrics and Prometheus is active", async () => {
    const c = makeTestContainer();
    c.get(MetricsStore).applyStatus({ name: "p", status: "active" });
    renderWithProviders(<ResourceDetailPanel node={podNode()} />, { container: c });
    expect(screen.getByRole("tab", { name: "Metrics" })).toBeInTheDocument();
  });

  it("triggers the describe use case for the selected node", async () => {
    const describe = vi.fn().mockResolvedValue("");
    const c = makeTestContainer();
    c.rebind(TYPES.DescribeNodeUseCase).toConstantValue({ execute: describe });
    renderWithProviders(<ResourceDetailPanel node={podNode()} />, { container: c });
    await waitFor(() => expect(describe).toHaveBeenCalledWith("pod1"));
  });
});
