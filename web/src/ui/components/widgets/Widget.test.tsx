import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import WidgetCard from "./Widget";
import { renderWithProviders } from "../../../test/render";

describe("WidgetCard", () => {
  it("renders title, subtitle and children in the default layout", () => {
    renderWithProviders(<WidgetCard title="Apps" subtitle="all of them"><span>body</span></WidgetCard>);
    expect(screen.getByText("Apps")).toBeInTheDocument();
    expect(screen.getByText("all of them")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders the compact layout with just a title", () => {
    renderWithProviders(<WidgetCard title="Compact" compact><span>c-body</span></WidgetCard>);
    expect(screen.getByText("Compact")).toBeInTheDocument();
    expect(screen.getByText("c-body")).toBeInTheDocument();
  });
});
