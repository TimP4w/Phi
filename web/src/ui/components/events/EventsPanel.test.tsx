import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventsPanel from "./EventsPanel";
import { renderWithProviders } from "../../../test/render";
import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";

const event = (over: Partial<KubeEvent>): KubeEvent =>
  Object.assign(Object.create(KubeEvent.prototype), {
    uid: "e1", kind: "Pod", name: "web", namespace: "ns", reason: "Started", message: "container started",
    source: "kubelet", type: "Normal", count: 1, resourceUID: "r1",
    firstObserved: new Date("2026-01-01T10:00:00Z"), lastObserved: new Date("2026-01-01T10:00:00Z"),
    ...over,
  }) as KubeEvent;

describe("EventsPanel", () => {
  it("renders each event's reason, message and link", () => {
    renderWithProviders(<EventsPanel events={[event({})]} filter="all" onFilterChange={() => {}} />);
    expect(screen.getByText("Started")).toBeInTheDocument();
    expect(screen.getByText("container started")).toBeInTheDocument();
    expect(screen.getByText("kubelet")).toBeInTheDocument();
  });

  it("shows 'No events' when empty with no total", () => {
    renderWithProviders(<EventsPanel events={[]} filter="all" onFilterChange={() => {}} />);
    expect(screen.getByText("No events")).toBeInTheDocument();
  });

  it("shows 'No matching events' when filtered down to nothing", () => {
    renderWithProviders(<EventsPanel events={[]} filter="Warning" onFilterChange={() => {}} totalEventCount={5} />);
    expect(screen.getByText("No matching events")).toBeInTheDocument();
  });

  it("invokes onFilterChange when a filter chip is clicked", async () => {
    const onFilterChange = vi.fn();
    renderWithProviders(<EventsPanel events={[]} filter="all" onFilterChange={onFilterChange} />);
    await userEvent.click(screen.getByText("Warning"));
    expect(onFilterChange).toHaveBeenCalledWith("Warning");
  });

  it("shows the repeat count and a custom link label when configured", () => {
    renderWithProviders(
      <EventsPanel events={[event({ count: 4, type: "Warning" })]} filter="all" onFilterChange={() => {}} showCount linkLabel={(e) => `go-${e.name}`} />,
    );
    expect(screen.getByText("×4")).toBeInTheDocument();
    expect(screen.getByText("go-web")).toBeInTheDocument();
  });
});
