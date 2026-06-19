import { describe, it, expect, vi } from "vitest";
import { Node, Edge } from "@xyflow/react";
import ConnectedGraph from "./ConnectedGraph";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { TYPES } from "../../../core/shared/types";
import { ResourceStatus, VisualizationNodeData } from "../../../core/fluxTree/models/tree";
import { kubeResource } from "../../../test/fixtures";

// A LayoutTreeUseCase stub returning a fixed laid-out graph.
const layoutStub = (nodes: Node<VisualizationNodeData>[], edges: Edge[]) => {
  const execute = vi.fn().mockResolvedValue({ nodes, edges });
  const relayout = vi.fn().mockResolvedValue({ nodes, edges });
  return { execute, relayout };
};

const node = (uid: string, status = ResourceStatus.SUCCESS, kind = "Pod"): Node<VisualizationNodeData> => ({
  id: uid,
  type: "resource",
  position: { x: 0, y: 0 },
  data: { treeNode: kubeResource({ uid, kind, name: uid, status }) },
});

describe("ConnectedGraph", () => {
  it("renders the React Flow canvas for a root resource", () => {
    const c = makeTestContainer();
    c.rebind(TYPES.LayoutTreeUseCase).toConstantValue(layoutStub([node("root")], []));
    const { container } = renderWithProviders(
      <ConnectedGraph rootResource={kubeResource({ uid: "root", kind: "Kustomization" })} onResourceClick={() => {}} />,
      { container: c },
    );
    expect(container.querySelector(".react-flow")).toBeInTheDocument();
  });

  it("applies a status filter by re-laying out the visible subset", async () => {
    const stub = layoutStub(
      [node("root", ResourceStatus.SUCCESS, "Kustomization"), node("bad", ResourceStatus.FAILED), node("ok", ResourceStatus.SUCCESS)],
      [{ id: "root-bad", source: "root", target: "bad" }, { id: "root-ok", source: "root", target: "ok" }],
    );
    const c = makeTestContainer();
    c.rebind(TYPES.LayoutTreeUseCase).toConstantValue(stub);
    renderWithProviders(
      <ConnectedGraph rootResource={kubeResource({ uid: "root", kind: "Kustomization" })} onResourceClick={() => {}} filter={{ statuses: [ResourceStatus.FAILED], kinds: [] }} />,
      { container: c },
    );
    // A filter with matches triggers a relayout of the filtered set.
    await vi.waitFor(() => expect(stub.relayout).toHaveBeenCalled());
  });

  it("renders an empty canvas when no root is provided", () => {
    const { container } = renderWithProviders(<ConnectedGraph onResourceClick={() => {}} />);
    expect(container.querySelector(".react-flow")).toBeInTheDocument();
  });
});
