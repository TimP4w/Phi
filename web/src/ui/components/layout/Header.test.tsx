import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import Header from "./Header";
import { renderWithProviders } from "../../../test/render";

describe("Header", () => {
  it("renders the brand and a children slot", () => {
    renderWithProviders(<Header><span>child-slot</span></Header>);
    expect(screen.getByText("Phi")).toBeInTheDocument();
    expect(screen.getByText("child-slot")).toBeInTheDocument();
  });
});
