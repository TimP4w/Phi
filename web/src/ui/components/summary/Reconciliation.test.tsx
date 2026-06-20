import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReconciliationSection from "./Reconciliation";
import { renderWithProviders } from "../../../test/render";
import { kubeResource, kustomization, withChildren } from "../../../test/fixtures";

describe("ReconciliationSection", () => {
  it("renders nothing when the subtree has no Flux applications", () => {
    const { container } = renderWithProviders(<ReconciliationSection root={kubeResource({ kind: "Cluster" })} />);
    expect(container.textContent).toBe("");
  });

  it("shows a pluralised heading and the health label", () => {
    const root = withChildren(kubeResource({ kind: "Cluster" }), [
      kustomization({ status: "success" }),
      kustomization({ status: "failed" }),
    ]);
    renderWithProviders(<ReconciliationSection root={root} />);
    expect(screen.getByText("2 Reconciliations")).toBeInTheDocument();
    expect(screen.getByText("1 failed")).toBeInTheDocument();
  });

  it("opens the applications modal when the health button is pressed", async () => {
    const root = withChildren(kubeResource({ kind: "Cluster" }), [kustomization({ status: "success", name: "only-app" })]);
    renderWithProviders(<ReconciliationSection root={root} />);
    expect(screen.getByText("1 Reconciliation")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Applications")).toBeInTheDocument();
  });
});
