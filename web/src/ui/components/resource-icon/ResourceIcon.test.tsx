import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import AppLogo from "./ResourceIcon";

describe("AppLogo", () => {
  it("renders the registered icon for a known group/kind", () => {
    const { container } = render(<AppLogo groupKind={{ group: "", kind: "Pod" }} />);
    expect(container.querySelector(".app-logo")?.childElementCount).toBeGreaterThan(0);
  });

  it("renders an empty logo container when no groupKind is given", () => {
    const { container } = render(<AppLogo />);
    expect(container.querySelector(".app-logo")).toBeInTheDocument();
  });
});
