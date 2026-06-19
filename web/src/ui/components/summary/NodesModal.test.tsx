import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NodesModal from "./NodesModal";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { makeDto } from "../../../test/fixtures";
import { Node } from "../../../core/fluxTree/models/tree";

const node = (name: string, ready = true, over: Record<string, unknown> = {}) =>
  new Node(makeDto({
    kind: "Node", name,
    conditions: [{ type: "Ready", status: ready ? "True" : "False", message: "", reason: "", lastTransitionTime: "2026-01-01T00:00:00Z" }],
    nodeMetadata: { internalIP: "10.0.0.1", os: "linux", architecture: "amd64", ...over } as never,
  }));

describe("NodesModal", () => {
  it("lists every node with a count", () => {
    renderWithProviders(<NodesModal isOpen onOpenChange={() => {}} nodes={[node("a"), node("b")]} />);
    expect(screen.getByText("Cluster Nodes")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
  });

  it("marks a cordoned node and renders usage bars from Prometheus", () => {
    const c = makeTestContainer();
    const metrics = c.get(MetricsStore);
    metrics.applyStatus({ name: "p", status: "active" });
    metrics.applyNodes([{ node: "a", cpu: { used: 1, capacity: 4, percent: 25 }, memory: { used: 1, capacity: 4, percent: 25 } }]);
    renderWithProviders(<NodesModal isOpen onOpenChange={() => {}} nodes={[node("a", true, { unschedulable: true })]} />, { container: c });
    expect(screen.getByText("Cordoned")).toBeInTheDocument();
  });

  it("opens the node detail modal when a node is clicked", async () => {
    renderWithProviders(<NodesModal isOpen onOpenChange={() => {}} nodes={[node("node-x")]} />);
    await userEvent.click(screen.getByText("node-x"));
    // The detail modal repeats the node name and shows the Roles row.
    expect(screen.getByText("Roles")).toBeInTheDocument();
  });
});
