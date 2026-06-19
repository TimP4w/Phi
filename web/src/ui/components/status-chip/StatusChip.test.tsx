import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import StatusChip from "./StatusChip";
import { renderWithProviders } from "../../../test/render";
import { kubeResource } from "../../../test/fixtures";

describe("StatusChip", () => {
  it("renders Unknown when no resource is given", () => {
    renderWithProviders(<StatusChip />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("renders the human status text for a resource", () => {
    renderWithProviders(<StatusChip resource={kubeResource({ status: "failed" })} />);
    expect(screen.getByText("Not Ready")).toBeInTheDocument();
  });
});
