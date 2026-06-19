import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Sparkline from "./Sparkline";

describe("Sparkline", () => {
  it("renders nothing with fewer than two points", () => {
    const { container } = render(<Sparkline values={[1]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders a polyline with one point per value", () => {
    const { container } = render(<Sparkline values={[1, 5, 3, 8]} />);
    const points = container.querySelector("polyline")?.getAttribute("points")?.trim().split(/\s+/);
    expect(points).toHaveLength(4);
  });

  it("handles a flat series without dividing by zero", () => {
    const { container } = render(<Sparkline values={[2, 2, 2]} />);
    expect(container.querySelector("polyline")).toBeInTheDocument();
  });
});
