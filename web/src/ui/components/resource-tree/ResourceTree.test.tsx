import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResourceTree from "./ResourceTree";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { ResourceStatus } from "../../../core/fluxTree/models/tree";
import { kubeResource, kustomization, withChildren } from "../../../test/fixtures";

describe("ResourceTree", () => {
  it("renders a loading skeleton when no resource is given", () => {
    const { container } = renderWithProviders(<ResourceTree level={0} onResourceClick={() => {}} />);
    expect(container.querySelector(".rounded-lg")).toBeInTheDocument();
  });

  it("renders a node row with its name, kind and namespace", () => {
    const node = kubeResource({ uid: "p", kind: "Pod", name: "web", namespace: "ns", status: "success" });
    renderWithProviders(<ResourceTree resource={node} level={0} onResourceClick={() => {}} />);
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText("Pod")).toBeInTheDocument();
    expect(screen.getByText("ns")).toBeInTheDocument();
  });

  it("calls onResourceClick when a row is clicked", async () => {
    const onResourceClick = vi.fn();
    const node = kubeResource({ uid: "p", kind: "Pod", name: "web" });
    renderWithProviders(<ResourceTree resource={node} level={0} onResourceClick={onResourceClick} />);
    await userEvent.click(screen.getByText("web"));
    expect(onResourceClick).toHaveBeenCalledWith(node);
  });

  it("expands and collapses children via the chevron", async () => {
    const parent = withChildren(kubeResource({ uid: "root", kind: "Cluster", name: "root" }), [
      kubeResource({ uid: "c1", kind: "Pod", name: "child-pod" }),
    ]);
    renderWithProviders(<ResourceTree resource={parent} level={0} onResourceClick={() => {}} />);
    // Children render by default at level 0.
    expect(screen.getByText("child-pod")).toBeInTheDocument();
    // The first button is the expand/collapse chevron.
    await userEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.queryByText("child-pod")).not.toBeInTheDocument();
  });

  it("hides a subtree that does not match an active filter", () => {
    const parent = withChildren(kubeResource({ uid: "root", kind: "Cluster", name: "root", status: "success" }), [
      kubeResource({ uid: "c1", kind: "Pod", name: "child-pod", status: "success" }),
    ]);
    const { container } = renderWithProviders(
      <ResourceTree resource={parent} level={0} onResourceClick={() => {}} filter={{ statuses: [ResourceStatus.FAILED], kinds: [] }} />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders a Trivy findings badge for a node with findings", () => {
    const c = makeTestContainer();
    const store = c.get(FluxTreeStore);
    store.syncResources([
      { uid: "pod", kind: "Pod", name: "web", namespace: "ns", annotations: {}, labels: {}, conditions: [], status: "success", isFluxManaged: false, isReconcilable: false, hasMetrics: false, createdAt: "2026-01-01T00:00:00Z" } as never,
      { uid: "report", kind: "VulnerabilityReport", name: "r", annotations: {}, labels: {}, conditions: [], status: "success", isFluxManaged: false, isReconcilable: false, hasMetrics: false, createdAt: "2026-01-01T00:00:00Z", trivyMetadata: { reportType: "vulnerability", critical: 3, targetKind: "Pod", targetName: "web", targetNamespace: "ns" } } as never,
    ]);
    const pod = store.findResourceByUid("pod")!;
    renderWithProviders(<ResourceTree resource={pod} level={0} onResourceClick={() => {}} />, { container: c });
    // The CVE count surfaces on the findings badge.
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("starts collapsed for a nested Kustomization", () => {
    const ks = withChildren(kustomization({ uid: "ks", name: "nested" }), [
      kubeResource({ uid: "c", kind: "Pod", name: "hidden-pod" }),
    ]);
    renderWithProviders(<ResourceTree resource={ks} level={1} onResourceClick={() => {}} />);
    expect(screen.queryByText("hidden-pod")).not.toBeInTheDocument();
  });
});
