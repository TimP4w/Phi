import { describe, it, expect } from "vitest";
import { Edge } from "@xyflow/react";
import { forwardClosure } from "./NetworkGraph";
import NetworkGraph from "./NetworkGraph";
import { renderWithProviders } from "../../../test/render";
import { kubeResource } from "../../../test/fixtures";

const edge = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });

describe("forwardClosure", () => {
  it("collects the start node and everything reachable downstream", () => {
    const edges = [edge("a", "b"), edge("b", "c"), edge("x", "y")];
    const { nodes, edges: e } = forwardClosure("a", edges);
    expect([...nodes].sort()).toEqual(["a", "b", "c"]);
    expect([...e].sort()).toEqual(["a-b", "b-c"]);
  });

  it("returns just the start node when it has no outgoing edges", () => {
    const { nodes, edges } = forwardClosure("leaf", [edge("a", "b")]);
    expect([...nodes]).toEqual(["leaf"]);
    expect(edges.size).toBe(0);
  });

  it("does not loop forever on a cycle", () => {
    const edges = [edge("a", "b"), edge("b", "a")];
    const { nodes } = forwardClosure("a", edges);
    expect([...nodes].sort()).toEqual(["a", "b"]);
  });
});

describe("NetworkGraph component", () => {
  it("renders the React Flow canvas for a root resource", () => {
    const { container } = renderWithProviders(
      <NetworkGraph rootResource={kubeResource({ uid: "root", kind: "Kustomization" })} onResourceClick={() => {}} />,
    );
    expect(container.querySelector(".react-flow")).toBeInTheDocument();
  });

  it("renders an empty canvas when no root is given", () => {
    const { container } = renderWithProviders(<NetworkGraph onResourceClick={() => {}} />);
    expect(container.querySelector(".react-flow")).toBeInTheDocument();
  });
});
