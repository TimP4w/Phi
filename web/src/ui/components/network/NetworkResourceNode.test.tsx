import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NetworkResourceNode, { daysUntil, networkDetail } from "./NetworkResourceNode";
import { renderWithProviders } from "../../../test/render";
import { kubeResource } from "../../../test/fixtures";

describe("daysUntil", () => {
  afterEach(() => vi.useRealTimers());

  it("returns whole days until a future ISO date", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(daysUntil("2026-01-11T00:00:00Z")).toBe(10);
  });

  it("returns null for an unparseable date", () => {
    expect(daysUntil("not-a-date")).toBeNull();
  });
});

describe("networkDetail", () => {
  it("describes a Service with type, IPs and ports", () => {
    const svc = kubeResource({ kind: "Service", serviceMetadata: { type: "ClusterIP", clusterIPs: ["10.0.0.1"], ports: [{ port: 80, targetPort: "8080", protocol: "TCP" }] } as never });
    expect(networkDetail(svc)).toBe("ClusterIP · 10.0.0.1 · TCP 80→8080");
  });

  it("describes a Gateway", () => {
    const gw = kubeResource({ kind: "Gateway", gatewayMetadata: { gatewayClassName: "traefik", addresses: ["1.2.3.4"] } as never });
    expect(networkDetail(gw)).toBe("traefik · 1.2.3.4");
  });

  it("describes a route by hostnames", () => {
    const route = kubeResource({ kind: "IngressRoute", routeMetadata: { hostnames: ["a.example.com"] } as never });
    expect(networkDetail(route)).toBe("a.example.com");
  });

  it("describes a Certificate with issuer, expiry and readiness", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const cert = kubeResource({ kind: "Certificate", certificateMetadata: { issuer: "letsencrypt", notAfter: "2026-01-11T00:00:00Z", ready: true } as never });
    expect(networkDetail(cert)).toBe("letsencrypt · expires 10d · Ready");
    vi.useRealTimers();
  });

  it("describes a NetworkPolicy by rule counts", () => {
    const np = kubeResource({ kind: "NetworkPolicy", networkPolicyMetadata: { policyTypes: ["Ingress", "Egress"], ingressRules: 2, egressRules: 1 } as never });
    expect(networkDetail(np)).toBe("Ingress/Egress · 2 in / 1 eg");
  });

  it("returns null for a kind with no network detail", () => {
    expect(networkDetail(kubeResource({ kind: "ConfigMap" }))).toBeNull();
  });
});

describe("NetworkResourceNode component", () => {
  const props = (data: unknown) => ({ data }) as never;

  it("renders nothing without a tree node", () => {
    const { container } = renderWithProviders(<NetworkResourceNode {...props({})} />);
    expect(container.querySelector(".relative")).toBeNull();
  });

  it("renders the resource identity and a detail line", () => {
    const svc = kubeResource({ uid: "svc", kind: "Service", name: "web", namespace: "ns", serviceMetadata: { type: "ClusterIP" } as never });
    renderWithProviders(<NetworkResourceNode {...props({ treeNode: svc })} />);
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText(/Service · ns/)).toBeInTheDocument();
  });

  it("shows a TLS lock popover with cert details", async () => {
    const route = kubeResource({ uid: "r", kind: "IngressRoute", name: "route", routeMetadata: { hostnames: ["x"] } as never });
    renderWithProviders(<NetworkResourceNode {...props({ treeNode: route, tls: { certName: "cert", certUid: "c1", issuer: "le", ready: true, secretName: "tls", dnsNames: ["x"] } })} />);
    await userEvent.click(screen.getByLabelText("TLS details"));
    expect(screen.getByText("TLS terminated")).toBeInTheDocument();
    expect(screen.getByText("cert")).toBeInTheDocument();
  });

  it("shows the network policy constraints popover", async () => {
    const pod = kubeResource({ uid: "p", kind: "Pod", name: "pod" });
    renderWithProviders(<NetworkResourceNode {...props({ treeNode: pod, policy: { policies: [{ uid: "np1", name: "allow" }], ingress: [{ sources: ["10.0.0.0/8"], ports: ":5432" }] } })} />);
    await userEvent.click(screen.getByLabelText("Network policy constraints"));
    expect(screen.getByText("Network policies in effect")).toBeInTheDocument();
  });
});
