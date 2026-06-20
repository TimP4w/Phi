import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HealthButton from "./HealthButton";

describe("HealthButton", () => {
  it("renders the label and a View affordance", () => {
    render(<HealthButton tone="success" label="All reconciled" onClick={() => {}} />);
    expect(screen.getByText("All reconciled")).toBeInTheDocument();
    expect(screen.getByText("View →")).toBeInTheDocument();
  });

  it("fires onClick when pressed", async () => {
    const onClick = vi.fn();
    render(<HealthButton tone="danger" label="1 failed" onClick={onClick} />);

    await userEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies the tone colour to the label", () => {
    const { rerender } = render(
      <HealthButton tone="danger" label="problem" onClick={() => {}} />,
    );
    expect(screen.getByText("problem")).toHaveClass("text-danger");

    rerender(<HealthButton tone="warning" label="problem" onClick={() => {}} />);
    expect(screen.getByText("problem")).toHaveClass("text-warning");
  });
});
