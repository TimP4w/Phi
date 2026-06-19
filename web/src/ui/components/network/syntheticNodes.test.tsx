import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeProps, Node } from "@xyflow/react";
import { renderWithProviders } from "../../../test/render";
import { NetworkNodeData } from "../../../core/network/usecases/NetworkTopology.usecase";
import InternetNode from "./InternetNode";
import ExternalIpNode from "./ExternalIpNode";
import EntrypointNode from "./EntrypointNode";
import MiddlewareWallNode from "./MiddlewareWallNode";
import PolicyPeerNode from "./PolicyPeerNode";

// React Flow node components receive a NodeProps object; tests only exercise `data`.
const props = (data: unknown) =>
  ({ data }) as unknown as NodeProps<Node<NetworkNodeData>>;

describe("InternetNode", () => {
  it("renders the internet label", () => {
    renderWithProviders(<InternetNode />);
    expect(screen.getByText("Internet")).toBeInTheDocument();
    expect(screen.getByText("External traffic")).toBeInTheDocument();
  });
});

describe("ExternalIpNode", () => {
  it("renders the IP label with an External IP subtitle", () => {
    renderWithProviders(<ExternalIpNode {...props({ label: "1.2.3.4" })} />);
    expect(screen.getByText("1.2.3.4")).toBeInTheDocument();
    expect(screen.getByText("External IP")).toBeInTheDocument();
  });

  it("renders an empty label when none is supplied", () => {
    renderWithProviders(<ExternalIpNode {...props({})} />);
    expect(screen.getByText("External IP")).toBeInTheDocument();
  });
});

describe("EntrypointNode", () => {
  it("renders the entrypoint name", () => {
    renderWithProviders(<EntrypointNode {...props({ label: "websecure" })} />);
    expect(screen.getByText("websecure")).toBeInTheDocument();
    expect(screen.getByText("Entrypoint")).toBeInTheDocument();
  });
});

describe("MiddlewareWallNode", () => {
  it("lists each middleware name", () => {
    renderWithProviders(<MiddlewareWallNode {...props({ label: "Middlewares", names: ["auth", "ratelimit"] })} />);
    expect(screen.getByText("auth")).toBeInTheDocument();
    expect(screen.getByText("ratelimit")).toBeInTheDocument();
  });

  it("falls back to a default label and empty list", () => {
    renderWithProviders(<MiddlewareWallNode {...props({})} />);
    expect(screen.getByText("Middlewares")).toBeInTheDocument();
  });
});

describe("PolicyPeerNode", () => {
  it("renders the label and subtitle", () => {
    renderWithProviders(<PolicyPeerNode {...props({ label: "10.0.0.0/8", names: ["CIDR"] })} />);
    expect(screen.getAllByText("10.0.0.0/8").length).toBeGreaterThan(0);
    expect(screen.getByText("CIDR")).toBeInTheDocument();
  });

  it("opens a details popover on the info button", async () => {
    renderWithProviders(<PolicyPeerNode {...props({ label: "10.0.0.0/8", names: ["CIDR"] })} />);
    await userEvent.click(screen.getByLabelText("Peer details"));
    // The label appears in both the node and the popover once open.
    expect(screen.getAllByText("10.0.0.0/8").length).toBeGreaterThan(1);
  });

  it("falls back to a default subtitle without names", () => {
    renderWithProviders(<PolicyPeerNode {...props({ label: "x" })} />);
    expect(screen.getByText("Policy peer")).toBeInTheDocument();
  });
});
