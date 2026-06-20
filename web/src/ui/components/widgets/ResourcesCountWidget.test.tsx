import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResourceCountWidget from "./ResourcesCountWidget";
import { renderWithProviders } from "../../../test/render";
import { kubeResource, kustomization, withChildren } from "../../../test/fixtures";

// A Kustomization (excluded by default) owning a mix of plain resources.
const subtree = () =>
  withChildren(kustomization({ uid: "ks", name: "app" }), [
    kubeResource({ uid: "p1", kind: "Pod", name: "ok", status: "success" }),
    kubeResource({ uid: "p2", kind: "Pod", name: "broken", status: "failed" }),
    kubeResource({ uid: "p3", kind: "Pod", name: "busy", status: "pending" }),
    kubeResource({ uid: "p4", kind: "Pod", name: "paused", status: "suspended" }),
  ]);

describe("ResourceCountWidget", () => {
  it("renders a skeleton when no resource is provided", () => {
    const { container } = renderWithProviders(<ResourceCountWidget />);
    expect(container.querySelector(".rounded-lg")).toBeInTheDocument();
  });

  it("counts non-excluded descendants by status in the card", () => {
    renderWithProviders(<ResourceCountWidget resource={subtree()} />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    // 4 countable pods (the Kustomization itself is excluded).
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Not Ready")).toBeInTheDocument();
    // health label reflects the failure.
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });

  it("renders the bare layout with a titled heading", () => {
    renderWithProviders(<ResourceCountWidget resource={subtree()} bare title="Subresources" />);
    expect(screen.getByText(/Subresources/)).toBeInTheDocument();
  });

  it("opens the modal pre-filtered to the failed tier", async () => {
    renderWithProviders(<ResourceCountWidget resource={subtree()} />);
    await userEvent.click(screen.getByRole("button", { name: /failed/ }));
    // 1 of 4 resources match the default Failed filter (modal header count).
    expect(screen.getByText(/1 \/ 4/)).toBeInTheDocument();
  });

  it("widens the modal filter when another status chip is toggled on", async () => {
    renderWithProviders(<ResourceCountWidget resource={subtree()} />);
    await userEvent.click(screen.getByRole("button", { name: /failed/ }));
    // Failed (default) + Reconciling → the failed and pending pods (2 of 4).
    await userEvent.click(screen.getByText("Reconciling"));
    expect(screen.getByText("(2 / 4)")).toBeInTheDocument();
  });
});
