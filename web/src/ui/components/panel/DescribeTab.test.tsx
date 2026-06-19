import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DescribeTab } from "./DescribeTab";
import { renderWithProviders } from "../../../test/render";

const describeYaml = `
object:
  metadata:
    name: web
    managedFields:
      - manager: kubectl
  spec:
    replicas: 1
`;

describe("DescribeTab", () => {
  it("shows a loading state", () => {
    renderWithProviders(<DescribeTab isLoading />);
    expect(screen.getByText("Loading resource definition…")).toBeInTheDocument();
  });

  it("shows an empty state when there is no describe text", () => {
    renderWithProviders(<DescribeTab />);
    expect(screen.getByText("No resource definition")).toBeInTheDocument();
  });

  it("renders the YAML with managedFields stripped", () => {
    renderWithProviders(<DescribeTab describe={describeYaml} />);
    // managedFields is removed before display.
    expect(screen.queryByText(/managedFields/)).not.toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("copies the YAML to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderWithProviders(<DescribeTab describe={describeYaml} />);
    await userEvent.click(screen.getByText("Copy"));
    expect(writeText).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Copied!")).toBeInTheDocument());
  });
});
