import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventDetailModal from "./EventDetailModal";
import { renderWithProviders } from "../../../test/render";
import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";

const event = (over: Partial<KubeEvent> = {}): KubeEvent =>
  Object.assign(Object.create(KubeEvent.prototype), {
    uid: "e1", kind: "Pod", name: "web", namespace: "ns", reason: "BackOff", message: "crashloop",
    source: "kubelet", type: "Warning", count: 3, resourceUID: "r1",
    firstObserved: new Date("2026-01-01T10:00:00Z"), lastObserved: new Date("2026-01-01T11:00:00Z"),
    ...over,
  }) as KubeEvent;

describe("EventDetailModal", () => {
  it("renders nothing when there is no event", () => {
    const { container } = renderWithProviders(<EventDetailModal event={null} isOpen onClose={() => {}} />);
    expect(container.textContent).toBe("");
  });

  it("renders the event fields", () => {
    renderWithProviders(<EventDetailModal event={event()} isOpen onClose={() => {}} />);
    expect(screen.getByText("BackOff")).toBeInTheDocument();
    expect(screen.getByText("crashloop")).toBeInTheDocument();
    expect(screen.getByText("Pod/web")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onClose when Close is pressed", async () => {
    const onClose = vi.fn();
    renderWithProviders(<EventDetailModal event={event()} isOpen onClose={onClose} />);
    await userEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates and closes via Go to resource when a resourceUID exists", async () => {
    const onClose = vi.fn();
    renderWithProviders(<EventDetailModal event={event()} isOpen onClose={onClose} />);
    await userEvent.click(screen.getByText("Go to resource"));
    expect(onClose).toHaveBeenCalled();
  });

  it("hides Go to resource when there is no resourceUID", () => {
    renderWithProviders(<EventDetailModal event={event({ resourceUID: "" })} isOpen onClose={() => {}} />);
    expect(screen.queryByText("Go to resource")).not.toBeInTheDocument();
  });
});
