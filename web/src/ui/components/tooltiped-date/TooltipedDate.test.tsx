import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import TooltipedDate from "./TooltipedDate";
import { renderWithProviders } from "../../../test/render";

describe("TooltipedDate", () => {
  it("renders a dash when no date is given", () => {
    renderWithProviders(<TooltipedDate />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("renders 'Invalid date' for an unparseable date", () => {
    renderWithProviders(<TooltipedDate date={new Date("nonsense")} />);
    expect(screen.getByText("Invalid date")).toBeInTheDocument();
  });

  it("renders a relative distance for a valid date", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    renderWithProviders(<TooltipedDate date={tenMinAgo} />);
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });
});
