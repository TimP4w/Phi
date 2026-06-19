import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import UsageChip from "./UsageChip";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { CurrentUsageDto } from "../../../core/metrics/models/dtos/metricsDto";

const usage = (over: Partial<CurrentUsageDto["spec"]>, cpu: number, mem: number): CurrentUsageDto => ({
  cpu: [{ t: 1, v: cpu }],
  memory: [{ t: 1, v: mem }],
  spec: { cpu: { requests: null, limits: 1 }, memory: { requests: null, limits: 100 }, ...over },
});

const withMetrics = (configure: (m: MetricsStore) => void) => {
  const container = makeTestContainer();
  const metrics = container.get(MetricsStore);
  metrics.applyStatus({ name: "p", status: "active" });
  configure(metrics);
  return container;
};

describe("UsageChip", () => {
  it("renders nothing when prometheus is inactive", () => {
    const { container: dom } = renderWithProviders(<UsageChip uid="u1" />);
    expect(dom.textContent).toBe("");
  });

  it("renders nothing when there is no usage sample", () => {
    const container = withMetrics(() => {});
    const { container: dom } = renderWithProviders(<UsageChip uid="u1" />, { container });
    expect(dom.textContent).toBe("");
  });

  it("renders nothing when usage is within limits", () => {
    const container = withMetrics((m) => m.applyCurrent({ u1: usage({}, 0.5, 50) }));
    const { container: dom } = renderWithProviders(<UsageChip uid="u1" />, { container });
    expect(dom.textContent).toBe("");
  });

  it("shows the CPU over-limit indicator when CPU exceeds its limit", () => {
    const container = withMetrics((m) => m.applyCurrent({ u1: usage({}, 2, 50) }));
    renderWithProviders(<UsageChip uid="u1" />, { container });
    expect(screen.getByTitle("CPU usage over limit")).toBeInTheDocument();
  });

  it("shows the memory over-limit indicator when memory exceeds its limit", () => {
    const container = withMetrics((m) => m.applyCurrent({ u1: usage({}, 0.5, 200) }));
    renderWithProviders(<UsageChip uid="u1" />, { container });
    expect(screen.getByTitle("Memory usage over limit")).toBeInTheDocument();
  });
});
