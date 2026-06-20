import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResourceListModal from "./ResourceListModal";
import { renderWithProviders } from "../../../test/render";
import { kubeResource } from "../../../test/fixtures";

const resources = [
  kubeResource({ uid: "1", name: "zebra", kind: "Pod", namespace: "default" }),
  kubeResource({ uid: "2", name: "apple", kind: "Pod", namespace: "kube-system" }),
  kubeResource({ uid: "3", name: "config", kind: "ConfigMap", namespace: "default" }),
];

describe("ResourceListModal", () => {
  it("does not render its content when closed", () => {
    renderWithProviders(<ResourceListModal isOpen={false} onOpenChange={() => {}} title="Applications" resources={resources} />);
    expect(screen.queryByText("Applications")).not.toBeInTheDocument();
  });

  it("lists resources sorted by kind then name with a count", () => {
    renderWithProviders(<ResourceListModal isOpen onOpenChange={() => {}} title="Applications" resources={resources} />);
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("(3)")).toBeInTheDocument();
    expect(screen.getByText("config")).toBeInTheDocument();
  });

  it("filters the list by the search query", async () => {
    renderWithProviders(<ResourceListModal isOpen onOpenChange={() => {}} title="Applications" resources={resources} />);
    await userEvent.type(screen.getByPlaceholderText("Filter…"), "apple");
    expect(screen.getByText("apple")).toBeInTheDocument();
    expect(screen.queryByText("zebra")).not.toBeInTheDocument();
  });

  it("shows the empty text when the filter matches nothing", async () => {
    renderWithProviders(<ResourceListModal isOpen onOpenChange={() => {}} title="Applications" resources={resources} emptyText="Nothing found" />);
    await userEvent.type(screen.getByPlaceholderText("Filter…"), "zzz");
    expect(screen.getByText("Nothing found")).toBeInTheDocument();
  });
});
