import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetricsTab from "./MetricsTab";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";

describe("MetricsTab", () => {
  it("renders the chart titles and a range hint", () => {
    renderWithProviders(<MetricsTab uid="u1" range="24h" onRangeChange={() => {}} />);
    expect(screen.getByText("CPU (cores)")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("drag a chart to zoom")).toBeInTheDocument();
  });

  it("renders with fetched metrics including spec lines", () => {
    const c = makeTestContainer();
    const metrics = c.get(MetricsStore);
    metrics.applyResource("u1", {
      range: "24h",
      spec: { cpu: { requests: 0.1, limits: 0.5 }, memory: { requests: 100, limits: 200 } },
      series: { cpu: [{ t: 1000, v: 0.2 }, { t: 2000, v: 0.3 }], memory: [{ t: 1000, v: 150 }] },
    });
    renderWithProviders(<MetricsTab uid="u1" range="24h" onRangeChange={() => {}} />, { container: c });
    expect(screen.getByText("Network (B/s)")).toBeInTheDocument();
  });

  it("changes range when a preset button is pressed", async () => {
    const onRangeChange = vi.fn();
    renderWithProviders(<MetricsTab uid="u1" range="24h" onRangeChange={onRangeChange} />);
    await userEvent.click(screen.getByRole("button", { name: "6h" }));
    expect(onRangeChange).toHaveBeenCalledWith("6h");
  });

  it("applies a valid custom range and ignores an invalid one", async () => {
    const onRangeChange = vi.fn();
    renderWithProviders(<MetricsTab uid="u1" range="24h" onRangeChange={onRangeChange} />);
    const input = screen.getByLabelText("Custom range");

    await userEvent.type(input, "bad{Enter}");
    expect(onRangeChange).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, "2h{Enter}");
    expect(onRangeChange).toHaveBeenCalledWith("2h");
  });

  it("shows a non-preset range as its own active button", () => {
    renderWithProviders(<MetricsTab uid="u1" range="2h" onRangeChange={() => {}} />);
    expect(screen.getByRole("button", { name: "2h" })).toBeInTheDocument();
  });
});
