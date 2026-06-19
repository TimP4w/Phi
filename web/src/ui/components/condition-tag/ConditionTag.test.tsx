import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import ConditionTag from "./ConditionTag";
import { renderWithProviders } from "../../../test/render";
import { Condition } from "../../../core/fluxTree/models/tree";

const cond = (over: Partial<{ type: string; status: boolean; reason: string; message: string }>): Condition =>
  Object.assign(
    new Condition({ type: "Ready", status: "True", message: "all good", reason: "", lastTransitionTime: "2026-01-01T00:00:00Z" }),
    over,
  );

describe("ConditionTag", () => {
  it("renders the condition type as its label", () => {
    renderWithProviders(<ConditionTag condition={cond({ type: "Ready" })} key="k" />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("renders for a failing condition type as well", () => {
    renderWithProviders(<ConditionTag condition={cond({ type: "Failed", status: false })} key="k" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders for a reason-classified custom type", () => {
    renderWithProviders(<ConditionTag condition={cond({ type: "Custom", reason: "Progressing" })} key="k" />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });
});
