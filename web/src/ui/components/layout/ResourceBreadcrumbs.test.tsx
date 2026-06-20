import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResourceBreadcrumbs from "./ResourceBreadcrumbs";

// The test matchMedia stub reports matches:true, so the component is in its
// mobile (collapsing) mode here.
const chain = [
  { key: "cluster", label: "Cluster" },
  { key: "a", label: "parent-a" },
  { key: "b", label: "parent-b" },
  { key: "c", label: "current" },
];

// Force the desktop branch by reporting the (max-width: 767px) query as unmatched.
const realMatchMedia = window.matchMedia;
function forceDesktop() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe("ResourceBreadcrumbs", () => {
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it("collapses the parent chain behind an ellipsis on mobile", () => {
    render(<ResourceBreadcrumbs items={chain} />);
    expect(screen.getByText("Cluster")).toBeInTheDocument();
    expect(screen.getByText("current")).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByText("parent-a")).not.toBeInTheDocument();
    expect(screen.queryByText("parent-b")).not.toBeInTheDocument();
  });

  it("reveals the hidden segments when the ellipsis is tapped", async () => {
    render(<ResourceBreadcrumbs items={chain} />);
    await userEvent.click(screen.getByText("…"));
    expect(screen.getByText("parent-a")).toBeInTheDocument();
    expect(screen.getByText("parent-b")).toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });

  it("shows the full chain without collapsing on desktop", () => {
    forceDesktop();
    render(<ResourceBreadcrumbs items={chain} />);
    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getByText("parent-a")).toBeInTheDocument();
    expect(screen.getByText("parent-b")).toBeInTheDocument();
  });

  it("renders without an ellipsis when there is no parent chain", () => {
    render(
      <ResourceBreadcrumbs
        items={[
          { key: "cluster", label: "Cluster" },
          { key: "c", label: "current" },
        ]}
      />,
    );
    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getByText("Cluster")).toBeInTheDocument();
    expect(screen.getByText("current")).toBeInTheDocument();
  });
});
