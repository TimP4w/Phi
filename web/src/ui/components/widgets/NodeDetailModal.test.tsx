import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import NodeDetailModal from "./NodeDetailModal";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { makeDto } from "../../../test/fixtures";
import { Node } from "../../../core/fluxTree/models/tree";

const node = (over: Record<string, unknown> = {}, conditionsReady = true) =>
  new Node(makeDto({
    kind: "Node", name: "node-1",
    conditions: [{ type: "Ready", status: conditionsReady ? "True" : "False", message: "", reason: "", lastTransitionTime: "2026-01-01T00:00:00Z" }],
    nodeMetadata: { internalIP: "10.0.0.1", os: "linux", architecture: "amd64", roles: ["worker"], ...over } as never,
  }));

describe("NodeDetailModal", () => {
  it("renders nothing when there is no node", () => {
    const { container } = renderWithProviders(<NodeDetailModal isOpen onOpenChange={() => {}} node={null} />);
    expect(container.textContent).toBe("");
  });

  it("renders node identity, Ready chip and metadata rows", () => {
    renderWithProviders(<NodeDetailModal isOpen onOpenChange={() => {}} node={node()} />);
    expect(screen.getByText("node-1")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    expect(screen.getByText("worker")).toBeInTheDocument();
  });

  it("shows a Cordoned chip and Not Ready for an unschedulable, unready node", () => {
    renderWithProviders(<NodeDetailModal isOpen onOpenChange={() => {}} node={node({ unschedulable: true }, false)} />);
    expect(screen.getByText("Not Ready")).toBeInTheDocument();
    expect(screen.getByText("Cordoned")).toBeInTheDocument();
  });

  it("renders usage progress bars when Prometheus reports node usage", () => {
    const c = makeTestContainer();
    const metrics = c.get(MetricsStore);
    metrics.applyStatus({ name: "p", status: "active" });
    metrics.applyNodes([{ node: "node-1", cpu: { used: 1, capacity: 4, percent: 25 }, memory: { used: 1e9, capacity: 4e9, percent: 25 } }]);
    renderWithProviders(<NodeDetailModal isOpen onOpenChange={() => {}} node={node()} />, { container: c });
    expect(screen.getByText(/CPU/)).toBeInTheDocument();
    expect(screen.getByText(/Mem/)).toBeInTheDocument();
  });
});
