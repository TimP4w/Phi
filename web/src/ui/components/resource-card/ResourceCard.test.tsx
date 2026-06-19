import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import ResourceCard from "./ResourceCard";
import { renderWithProviders } from "../../../test/render";
import { kubeResource } from "../../../test/fixtures";
import { ROUTES } from "../../routes/routes.enum";

describe("ResourceCard", () => {
  it("renders name, kind/namespace and links to the resource view", () => {
    const r = kubeResource({ uid: "u1", name: "web", kind: "Pod", namespace: "default", status: "success" });
    renderWithProviders(<ResourceCard resource={r} />);

    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText(/Pod • default/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", `${ROUTES.RESOURCE}/u1`);
  });
});
