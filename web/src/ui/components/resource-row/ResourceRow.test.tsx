import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import ResourceRow from "./ResourceRow";
import { renderWithProviders } from "../../../test/render";
import { kubeResource } from "../../../test/fixtures";

describe("ResourceRow", () => {
  it("renders the resource name, kind and namespace", () => {
    const r = kubeResource({ uid: "u1", name: "web", kind: "Pod", namespace: "default", status: "success" });
    renderWithProviders(<ResourceRow resource={r} />);
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText("Pod")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
  });

  it("surfaces the failing condition message for a failed resource", () => {
    const r = kubeResource({
      uid: "u1", name: "web", kind: "Pod", status: "failed",
      conditions: [{ type: "Ready", status: "False", message: "boom", reason: "Err", lastTransitionTime: "2026-01-01T00:00:00Z" }],
    });
    renderWithProviders(<ResourceRow resource={r} />);
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("omits the failure message for a healthy resource", () => {
    const r = kubeResource({ uid: "u1", name: "web", kind: "Pod", status: "success" });
    renderWithProviders(<ResourceRow resource={r} />);
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });
});
