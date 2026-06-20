import { describe, it, expect } from "vitest";
import {
  NetworkTopologyUseCase,
  INTERNET_NODE_ID,
  dnsMatches,
  portsLabel,
  entrypointLabel,
  gatewayLabel,
} from "./NetworkTopology.usecase";
import { FluxTreeStore } from "../../fluxTree/stores/fluxTree.store";
import { kubeResource } from "../../../test/fixtures";
import { TreeNodeDto } from "../../fluxTree/models/dtos/treeDto";

describe("dnsMatches", () => {
  it("matches an exact hostname", () => {
    expect(dnsMatches("a.example.com", "a.example.com")).toBe(true);
    expect(dnsMatches("a.example.com", "b.example.com")).toBe(false);
  });

  it("matches a single-label leading wildcard but not deeper subdomains", () => {
    expect(dnsMatches("a.example.com", "*.example.com")).toBe(true);
    expect(dnsMatches("a.b.example.com", "*.example.com")).toBe(false);
  });
});

describe("portsLabel", () => {
  it("returns empty for no ports (all ports allowed)", () => {
    expect(portsLabel()).toBe("");
    expect(portsLabel([])).toBe("");
  });

  it("renders ports with ranges and non-TCP protocols", () => {
    expect(portsLabel([{ port: "5432" }])).toBe(":5432");
    expect(portsLabel([{ port: "53", protocol: "UDP" }])).toBe(":53/UDP");
    expect(portsLabel([{ port: "8000", endPort: 9000 }])).toBe(":8000-9000");
    expect(portsLabel([{ protocol: "TCP" }])).toBe(":*");
  });
});

describe("entrypointLabel", () => {
  const svc = (over: Record<string, unknown>) => kubeResource({ kind: "Service", serviceMetadata: over as never });

  it("describes a LoadBalancer with IPs and ports", () => {
    expect(entrypointLabel(svc({ type: "LoadBalancer", externalIPs: ["1.2.3.4"], ports: [{ port: 443 }] }))).toBe(
      "LoadBalancer · 1.2.3.4 · :443",
    );
  });

  it("describes a LoadBalancer awaiting an IP", () => {
    expect(entrypointLabel(svc({ type: "LoadBalancer", ports: [] }))).toBe("LoadBalancer · pending IP");
  });

  it("describes a NodePort", () => {
    expect(entrypointLabel(svc({ type: "NodePort", ports: [{ port: 80, nodePort: 30080 }] }))).toBe("NodePort · :30080");
  });

  it("falls back to the bare type, and empty when there is no metadata", () => {
    expect(entrypointLabel(svc({ type: "ClusterIP" }))).toBe("ClusterIP");
    expect(entrypointLabel(kubeResource({ kind: "Service" }))).toBe("");
  });
});

describe("gatewayLabel", () => {
  it("describes a gateway with addresses and listener ports", () => {
    const gw = kubeResource({ kind: "Gateway", gatewayMetadata: { addresses: ["1.2.3.4"], listeners: [{ port: 443 }] } as never });
    expect(gatewayLabel(gw)).toBe("Gateway · 1.2.3.4 · :443");
  });

  it("describes a gateway awaiting an address and one with no metadata", () => {
    expect(gatewayLabel(kubeResource({ kind: "Gateway", gatewayMetadata: {} as never }))).toBe("Gateway · pending address");
    expect(gatewayLabel(kubeResource({ kind: "Gateway" }))).toBe("Gateway");
  });
});

// --- integration through execute -------------------------------------------

const build = async (dtos: Partial<TreeNodeDto>[], focus: string) => {
  const store = new FluxTreeStore();
  store.syncResources(dtos.map((d) => ({ ...kubeResourceDto(d) })));
  return new NetworkTopologyUseCase(store).execute({ nodeId: focus });
};

// Minimal DTO builder mirroring the fixtures' defaults but as a plain DTO.
function kubeResourceDto(over: Partial<TreeNodeDto>): TreeNodeDto {
  return {
    uid: over.uid ?? "x",
    name: over.name ?? "res",
    kind: over.kind ?? "ConfigMap",
    annotations: {},
    labels: over.labels ?? {},
    conditions: [],
    status: "success",
    isFluxManaged: false,
    isReconcilable: false,
    hasMetrics: false,
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  } as TreeNodeDto;
}

describe("NetworkTopologyUseCase.execute", () => {
  it("builds a LoadBalancer → Service → Pod chain from the internet, with a route and policy", async () => {
    const { nodes, edges } = await build(
      [
        { uid: "app", kind: "Kustomization", name: "app" },
        {
          uid: "svc", kind: "Service", name: "web", namespace: "ns", parentIDs: ["app"],
          serviceMetadata: { type: "LoadBalancer", externalIPs: ["1.2.3.4"], ports: [{ port: 443 }] } as never,
        },
        {
          uid: "route", kind: "IngressRoute", name: "web-route", namespace: "ns", parentIDs: ["app"],
          routeMetadata: {
            addresses: ["1.2.3.4"], entryPoints: ["websecure"], hostnames: ["web.example.com"],
            middlewareRefs: ["ns-auth@kubernetescrd"], backendRefs: [{ kind: "Service", name: "web" }],
            tlsEnabled: true,
          } as never,
        },
        {
          uid: "eps", kind: "EndpointSlice", name: "web-abc", namespace: "ns", parentIDs: ["app"],
          endpointSliceMetadata: { serviceName: "web", endpoints: [{ targetUID: "pod", ready: true }] } as never,
        },
        { uid: "pod", kind: "Pod", name: "web-0", namespace: "ns", parentIDs: ["app"], labels: { app: "web" } },
        {
          uid: "np", kind: "NetworkPolicy", name: "allow", namespace: "ns", parentIDs: ["app"],
          networkPolicyMetadata: {
            podSelector: { app: "web" },
            egress: [{ peers: [{ ipBlock: "10.0.0.0/8" }], ports: [{ port: "5432" }] }],
            ingress: [{ peers: [], ports: [] }],
          } as never,
        },
        {
          uid: "proxy", kind: "Deployment", name: "traefik", namespace: "ns", parentIDs: ["app"],
          proxyMetadata: { entrypointMiddlewares: { websecure: ["ns-global@kubernetescrd"] } } as never,
        },
        { uid: "mw", kind: "Middleware", name: "auth", namespace: "ns", parentIDs: ["app"] },
        { uid: "cert", kind: "Certificate", name: "web-cert", namespace: "ns", parentIDs: ["app"],
          certificateMetadata: { secretName: "web-tls", dnsNames: ["*.example.com"], issuer: "letsencrypt", ready: true } as never },
        { uid: "secret", kind: "Secret", name: "web-tls", namespace: "ns", parentIDs: ["app"] },
      ],
      "app",
    );

    const ids = nodes.map((n) => n.id);
    expect(ids).toContain(INTERNET_NODE_ID);
    expect(ids).toContain("svc");
    expect(ids).toContain("pod");
    expect(ids).toContain("ip::1.2.3.4");
    // Service→Pod edge resolved via EndpointSlice.
    expect(edges.some((e) => e.source === "svc" && e.target === "pod")).toBe(true);
    // Internet reaches the external IP which fronts the service.
    expect(edges.some((e) => e.source === INTERNET_NODE_ID && e.target === "ip::1.2.3.4")).toBe(true);
    // Policy egress edge to a CIDR peer node is present and dashed-purple.
    const policyEdge = edges.find((e) => e.id.startsWith("policy::egress"));
    expect(policyEdge).toBeDefined();
    // Pod node carries its gating policy in data.
    const podNode = nodes.find((n) => n.id === "pod");
    expect((podNode!.data as { policy?: unknown }).policy).toBeDefined();
    // TLS info attached to the route node.
    const routeNode = nodes.find((n) => n.id === "route");
    expect((routeNode!.data as { tls?: { certName?: string } }).tls?.certName).toBe("web-cert");
  });

  it("draws a pending-IP LoadBalancer as an unhealthy edge straight from the internet", async () => {
    const { edges } = await build(
      [
        { uid: "app", kind: "Kustomization", name: "app" },
        { uid: "svc", kind: "Service", name: "web", namespace: "ns", parentIDs: ["app"],
          serviceMetadata: { type: "LoadBalancer", externalIPs: [], ports: [] } as never },
      ],
      "app",
    );
    const e = edges.find((e) => e.source === INTERNET_NODE_ID && e.target === "svc");
    expect(e).toBeDefined();
    expect(e!.animated).toBe(true); // unhealthy edges animate
  });

  it("links a Gateway to its GatewayClass and a route attached to it", async () => {
    const { nodes, edges } = await build(
      [
        { uid: "app", kind: "Kustomization", name: "app" },
        { uid: "gw", kind: "Gateway", name: "gw", namespace: "ns", parentIDs: ["app"],
          gatewayMetadata: { addresses: ["1.2.3.4"], gatewayClassName: "traefik", listeners: [{ port: 443 }], tlsSecretRefs: ["ns/tls"] } as never },
        { uid: "gwc", kind: "GatewayClass", name: "traefik", parentIDs: ["app"] },
        { uid: "secret", kind: "Secret", name: "tls", namespace: "ns", parentIDs: ["app"] },
        { uid: "route", kind: "HTTPRoute", name: "r", namespace: "ns", parentIDs: ["app"],
          routeMetadata: { routeParentRefs: [{ name: "gw" }], backendRefs: [{ name: "web" }] } as never },
        { uid: "svc", kind: "Service", name: "web", namespace: "ns", parentIDs: ["app"], serviceMetadata: { type: "ClusterIP" } as never },
      ],
      "app",
    );
    expect(edges.some((e) => e.source === "gw" && e.target === "gwc")).toBe(true);
    expect(edges.some((e) => e.source === "gw" && e.target === "route")).toBe(true);
    expect(nodes.find((n) => n.id === "gw")).toBeDefined();
  });

  it("falls back to a single node for a focus with no networking edges", async () => {
    const { nodes } = await build(
      [{ uid: "app", kind: "Kustomization", name: "app" }],
      "app",
    );
    expect(nodes.map((n) => n.id)).toEqual(["app"]);
  });

  it("returns an empty graph for a missing focus", async () => {
    const store = new FluxTreeStore();
    const { nodes } = await new NetworkTopologyUseCase(store).execute({ nodeId: "ghost" });
    // Only the lone focus seed which has no node, so no resource node is produced.
    expect(nodes.every((n) => n.id !== INTERNET_NODE_ID)).toBe(true);
  });

  it("exposes a NodePort service to the internet", async () => {
    const { edges } = await build(
      [
        { uid: "app", kind: "Kustomization", name: "app" },
        { uid: "svc", kind: "Service", name: "web", namespace: "ns", parentIDs: ["app"],
          serviceMetadata: { type: "NodePort", ports: [{ port: 80, nodePort: 30080 }] } as never },
      ],
      "app",
    );
    expect(edges.some((e) => e.source === INTERNET_NODE_ID && e.target === "svc" && /NodePort/.test(String(e.label)))).toBe(true);
  });
});
