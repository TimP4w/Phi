import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterDropdown from "./FilterDropdown";

const options = [
  { key: "a", label: "Apple" },
  { key: "b", label: "Banana" },
];

describe("FilterDropdown", () => {
  it("renders the label and hides the count badge when nothing is selected", () => {
    render(
      <FilterDropdown label="Fruit" options={options} selected={[]} onChange={() => {}} />,
    );
    expect(screen.getByText("Fruit")).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("shows the number of active selections", () => {
    render(
      <FilterDropdown
        label="Fruit"
        options={options}
        selected={["a", "b"]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("marks the active options as checked in the open menu", async () => {
    render(
      <FilterDropdown label="Fruit" options={options} selected={["a"]} onChange={() => {}} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Fruit/ }));
    expect(await screen.findByRole("menuitemcheckbox", { name: "Apple" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Banana" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("emits the selected keys when an option is chosen", async () => {
    const onChange = vi.fn();
    render(
      <FilterDropdown label="Fruit" options={options} selected={[]} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Fruit/ }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Apple" }));
    expect(onChange).toHaveBeenCalledWith(["a"]);
  });
});
