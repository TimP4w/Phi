import { Edge, Node } from "@xyflow/react";
import { inject, injectable } from "inversify";
import UseCase from "../../shared/usecase";
import { FluxTreeStore } from "../../fluxTree/stores/fluxTree.store";
import ELK, { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk.bundled.js";
import { KubeResource } from "../../fluxTree/models/tree";
import { RESOURCE_TYPE } from "../../fluxTree/constants/resources.const";
import { NetworkProvider } from "../providers/networkProvider";
import { TraefikProvider } from "../providers/traefik.provider";

export const INTERNET_NODE_ID = "internet";

// TLS termination details surfaced in a route/gateway node's lock popover.
export type NetworkTLSInfo = {
  certUid?: string;
  certName?: string;
  issuer?: string;
  notAfter?: string;
  ready?: boolean;
  secretName?: string;
  secretUid?: string;
  dnsNames?: string[];
};

// One NetworkPolicy ingress rule surfaced on a pod node: permitted sources and ports.
export type PolicyIngressRule = { sources: string[]; ports?: string };

// NetworkPolicy constraints gating a pod, shown as a clickable indicator on the pod node.
export type PolicyConstraints = {
  policies: { uid: string; name: string }[];
  ingress: PolicyIngressRule[];
};

// Node data is either a real resource, a synthetic layer node (label + optional names), or the internet node.
export type NetworkNodeData =
  | { treeNode: KubeResource; tls?: NetworkTLSInfo; policy?: PolicyConstraints }
  | { label: string; names?: string[] }
  | Record<string, never>;

type Output = { nodes: Node<NetworkNodeData>[]; edges: Edge[] };
type Input = { nodeId: string };

// A logical traffic edge before layout.
type LogicalEdge = { source: string; target: string; healthy: boolean; label?: string };

// A policy edge is an allowance declared by a NetworkPolicy, anchored to the gated pod.
type PolicyEdge = { source: string; target: string; anchor: string; direction: "ingress" | "egress"; label?: string };

// dnsMatches reports whether a hostname is covered by a cert DNS name (single leading wildcard supported).
export function dnsMatches(host: string, pattern: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".example.com"
    return host.endsWith(suffix) && !host.slice(0, host.length - suffix.length).includes(".");
  }
  return false;
}

// portsLabel renders a policy rule's ports (":5432, :53/UDP"); empty = all ports.
export function portsLabel(ports?: { protocol?: string; port?: string; endPort?: number }[]): string {
  if (!ports || ports.length === 0) return "";
  return ports
    .map((p) => {
      const port = p.port ?? "*";
      const range = p.endPort ? `-${p.endPort}` : "";
      const proto = p.protocol && p.protocol !== "TCP" ? `/${p.protocol}` : "";
      return `:${port}${range}${proto}`;
    })
    .join(", ");
}

export const COLOR_POLICY = "#9353d3"; // heroui secondary — policy allowances

// entrypointLabel describes how external traffic reaches a Service entrypoint.
export function entrypointLabel(service: KubeResource): string {
  const meta = service.serviceMetadata;
  if (!meta) return "";
  const ports = meta.ports ?? [];
  if (meta.type === "LoadBalancer") {
    const ips = (meta.externalIPs ?? []).join(", ") || "pending IP";
    const portList = ports.map((p) => p.port).join(", ");
    return `LoadBalancer · ${ips}${portList ? ` · :${portList}` : ""}`;
  }
  if (meta.type === "NodePort") {
    const nodePorts = ports.map((p) => p.nodePort).filter(Boolean).join(", ");
    return `NodePort · :${nodePorts || "?"}`;
  }
  return meta.type ?? "";
}

export function gatewayLabel(gateway: KubeResource): string {
  const meta = gateway.gatewayMetadata;
  if (!meta) return "Gateway";
  const addrs = (meta.addresses ?? []).join(", ") || "pending address";
  const ports = (meta.listeners ?? []).map((l) => l.port).filter(Boolean).join(", ");
  return `Gateway · ${addrs}${ports ? ` · :${ports}` : ""}`;
}

export const COLOR_HEALTHY = "#17c964"; // heroui success
export const COLOR_UNHEALTHY = "#f5a524"; // heroui warning

@injectable()
export class NetworkTopologyUseCase extends UseCase<Input, Promise<Output>> {
  private elk = new ELK();
  private elkOptions = {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
    "elk.layered.spacing.nodeNodeBetweenLayers": "120",
    "elk.spacing.nodeNode": "32",
    // Orthogonal edges + crossing/alignment passes keep a wide fan-out followable.
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    "elk.layered.crossingMinimization.semiInteractive": "true",
    "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  };

  constructor(@inject(FluxTreeStore) private fluxTreeStore: FluxTreeStore) {
    super();
  }

  public execute(input: Input): Promise<Output> {
    const { nodes, edges } = this.buildFocusedGraph(input.nodeId);

    const graph: ElkNode = {
      id: "root",
      layoutOptions: this.elkOptions,
      children: nodes.map((node) => ({
        ...node,
        targetPosition: "left",
        sourcePosition: "right",
        width: 240,
        height: 96,
      })),
      edges: edges as unknown[] as ElkExtendedEdge[],
    };

    return this.elk.layout(graph).then((layouted: ElkNode) => {
      if (!layouted.children) return { nodes: [], edges: [] };
      return {
        nodes: layouted.children.map((node) => ({
          ...node,
          position: { x: node.x!, y: node.y! },
        })) as Node<NetworkNodeData>[],
        edges: (layouted.edges as unknown[] as Edge[]) || [],
      };
    });
  }

  // buildFocusedGraph resolves the traffic chain reachable from the focus resource.
  private buildFocusedGraph(focusId: string): { nodes: Node<NetworkNodeData>[]; edges: Edge[] } {
    const resources = this.fluxTreeStore.resources;

    const serviceByKey = new Map<string, KubeResource>();
    const gatewayByKey = new Map<string, KubeResource>();
    const gatewayClassByName = new Map<string, KubeResource>();
    const secretByKey = new Map<string, KubeResource>();
    const certBySecretKey = new Map<string, KubeResource>();
    // All Certificates, for matching a secret-less route's hostnames to a cert's DNS names.
    const certificates: KubeResource[] = [];
    const networkPolicies: KubeResource[] = [];
    // Entrypoint name -> middleware refs, aggregated from every proxy workload's ProxyMetadata.
    const entrypointMiddlewares = new Map<string, string[]>();
    // Synthetic layer nodes (external IPs, entrypoints, middleware walls) that aren't Kubernetes resources.
    const syntheticMeta = new Map<
      string,
      { type: "externalIp" | "entrypoint" | "middlewareWall" | "policyPeer"; label: string; names?: string[] }
    >();
    const ipNodeId = (ip: string) => `ip::${ip}`;
    const entrypointNodeId = (lbUid: string, ep: string) => `ep::${lbUid}::${ep}`;

    // Vendor-specific ref handling is delegated to providers; instantiated per build for fresh indexes.
    const providers: NetworkProvider[] = [new TraefikProvider()];
    const middlewareName = (ref: string): string => {
      for (const p of providers) {
        const resolved = p.resolveMiddleware(ref);
        if (resolved) return resolved.name;
      }
      return ref;
    };
    // Index LoadBalancer Services by external address so a route can link to its fronting Service.
    const lbServiceByAddress = new Map<string, KubeResource>();
    resources.forEach((r) => {
      providers.forEach((p) => p.index(r));
      if (r.kind === RESOURCE_TYPE.SERVICE) {
        serviceByKey.set(`${r.namespace}/${r.name}`, r);
        if (r.serviceMetadata?.type === "LoadBalancer") {
          for (const ip of r.serviceMetadata.externalIPs ?? []) lbServiceByAddress.set(ip, r);
        }
      }
      if (r.kind === RESOURCE_TYPE.GATEWAY) gatewayByKey.set(`${r.namespace}/${r.name}`, r);
      if (r.kind === RESOURCE_TYPE.GATEWAYCLASS) gatewayClassByName.set(r.name, r);
      if (r.kind === RESOURCE_TYPE.SECRET) secretByKey.set(`${r.namespace}/${r.name}`, r);
      if (r.kind === RESOURCE_TYPE.CERTIFICATE) {
        certificates.push(r);
        if (r.certificateMetadata?.secretName) {
          certBySecretKey.set(`${r.namespace}/${r.certificateMetadata.secretName}`, r);
        }
      }
      if (r.kind === RESOURCE_TYPE.NETWORKPOLICY) networkPolicies.push(r);
      if (r.proxyMetadata?.entrypointMiddlewares) {
        for (const [ep, refs] of Object.entries(r.proxyMetadata.entrypointMiddlewares)) {
          entrypointMiddlewares.set(ep, [...(entrypointMiddlewares.get(ep) ?? []), ...refs]);
        }
      }
    });

    const resourceEdges: LogicalEdge[] = [];
    const internetEdges: LogicalEdge[] = [];
    // Policy edges are NetworkPolicy egress allowances, anchored to the gated pod.
    const policyEdges: PolicyEdge[] = [];

    // TLS info per route/gateway, surfaced in the node's lock popover.
    const tlsByNode = new Map<string, NetworkTLSInfo>();

    // resolveTls finds the cert backing a route/gateway, by named secret then by matching hostnames to DNS names.
    const resolveTls = (anchorUid: string, refs: string[], hostnames?: string[]) => {
      let cert: KubeResource | undefined;
      let secret: KubeResource | undefined;
      for (const key of refs) {
        secret = secret ?? secretByKey.get(key);
        cert = cert ?? certBySecretKey.get(key);
      }
      if (!cert && (hostnames?.length ?? 0) > 0) {
        cert = certificates.find((c) =>
          (c.certificateMetadata?.dnsNames ?? []).some((dn) => hostnames!.some((h) => dnsMatches(h, dn))),
        );
      }
      const cm = cert?.certificateMetadata;
      const secretName = cm?.secretName ?? (refs[0] ? refs[0].split("/").pop() : undefined);
      if (!secret && cert && cm?.secretName) {
        secret = secretByKey.get(`${cert.namespace}/${cm.secretName}`);
      }
      tlsByNode.set(anchorUid, {
        certUid: cert?.uid,
        certName: cert?.name,
        issuer: cm?.issuer,
        notAfter: cm?.notAfter,
        ready: cm?.ready,
        secretName,
        secretUid: secret?.uid,
        dnsNames: cm?.dnsNames,
      });
    };

    // entrypointExit returns the node routes attach from: the entrypoint's middleware wall, else the entrypoint.
    const entrypointExitCache = new Map<string, string>();
    const entrypointExit = (lbUid: string, ep: string): string => {
      const epId = entrypointNodeId(lbUid, ep);
      const cached = entrypointExitCache.get(epId);
      if (cached) return cached;
      let exit = epId;
      const refs = entrypointMiddlewares.get(ep) ?? [];
      if (refs.length > 0) {
        const wallId = `${epId}::wall`;
        syntheticMeta.set(wallId, {
          type: "middlewareWall",
          label: "Middlewares",
          names: refs.map(middlewareName),
        });
        resourceEdges.push({ source: epId, target: wallId, healthy: true });
        exit = wallId;
      }
      entrypointExitCache.set(epId, exit);
      return exit;
    };

    resources.forEach((r) => {
      // Entrypoints exposed to the internet; LoadBalancers get an external-IP node per address.
      if (r.kind === RESOURCE_TYPE.SERVICE && r.serviceMetadata?.type === "LoadBalancer") {
        const ips = r.serviceMetadata.externalIPs ?? [];
        if (ips.length > 0) {
          const portList = (r.serviceMetadata.ports ?? []).map((p) => p.port).join(", ");
          for (const ip of ips) {
            const id = ipNodeId(ip);
            syntheticMeta.set(id, { type: "externalIp", label: ip });
            internetEdges.push({ source: INTERNET_NODE_ID, target: id, healthy: true, label: portList ? `:${portList}` : undefined });
            resourceEdges.push({ source: id, target: r.uid, healthy: true });
          }
        } else {
          internetEdges.push({ source: INTERNET_NODE_ID, target: r.uid, healthy: false, label: "LoadBalancer · pending IP" });
        }
      }
      if (r.kind === RESOURCE_TYPE.SERVICE && r.serviceMetadata?.type === "NodePort") {
        internetEdges.push({ source: INTERNET_NODE_ID, target: r.uid, healthy: true, label: entrypointLabel(r) });
      }
      if (r.kind === RESOURCE_TYPE.GATEWAY) {
        internetEdges.push({
          source: INTERNET_NODE_ID,
          target: r.uid,
          healthy: (r.gatewayMetadata?.addresses?.length ?? 0) > 0,
          label: gatewayLabel(r),
        });
        const className = r.gatewayMetadata?.gatewayClassName;
        const gwClass = className ? gatewayClassByName.get(className) : undefined;
        if (gwClass) resourceEdges.push({ source: r.uid, target: gwClass.uid, healthy: true });
        const gwTlsRefs = r.gatewayMetadata?.tlsSecretRefs ?? [];
        if (gwTlsRefs.length > 0) resolveTls(r.uid, gwTlsRefs);
      }

      // Routes: attached to a Gateway, fronted by the LB Service (by address), else drawn from the internet.
      if (r.routeMetadata) {
        const parentRefs = r.routeMetadata.routeParentRefs ?? [];
        // Controller-agnostic "which door" label: entrypoints, else ingressClass, else hostnames.
        const entryLabel =
          r.routeMetadata.entryPoints?.join(", ") ||
          r.routeMetadata.class ||
          r.routeMetadata.hostnames?.join(", ");
        let linked = false;
        if (parentRefs.length > 0) {
          for (const ref of parentRefs) {
            const gw = gatewayByKey.get(`${ref.namespace ?? r.namespace}/${ref.name}`);
            if (gw) {
              resourceEdges.push({ source: gw.uid, target: r.uid, healthy: true, label: entryLabel });
              linked = true;
            }
          }
        }
        if (!linked) {
          // Match the LB Service by address, then route through an entrypoint node per bound entrypoint.
          const lbService = (r.routeMetadata.addresses ?? [])
            .map((addr) => lbServiceByAddress.get(addr))
            .find((svc): svc is KubeResource => !!svc);
          if (lbService) {
            const eps = r.routeMetadata.entryPoints ?? [];
            if (eps.length > 0) {
              for (const ep of eps) {
                const epId = entrypointNodeId(lbService.uid, ep);
                syntheticMeta.set(epId, { type: "entrypoint", label: ep });
                resourceEdges.push({ source: lbService.uid, target: epId, healthy: true });
                // Route attaches after the entrypoint's own middleware wall (if any).
                resourceEdges.push({ source: entrypointExit(lbService.uid, ep), target: r.uid, healthy: true });
              }
            } else {
              resourceEdges.push({ source: lbService.uid, target: r.uid, healthy: true, label: entryLabel });
            }
            linked = true;
          }
        }
        if (!linked) {
          internetEdges.push({ source: INTERNET_NODE_ID, target: r.uid, healthy: true, label: entryLabel });
        }
        // Route-level middlewares render as one "wall" node between the route and its backends.
        let tail = r.uid;
        const mwRefs = r.routeMetadata.middlewareRefs ?? [];
        if (mwRefs.length > 0) {
          const wallId = `${r.uid}::wall`;
          syntheticMeta.set(wallId, {
            type: "middlewareWall",
            label: "Middlewares",
            names: mwRefs.map(middlewareName),
          });
          resourceEdges.push({ source: r.uid, target: wallId, healthy: true });
          tail = wallId;
        }
        for (const backend of r.routeMetadata.backendRefs ?? []) {
          if (backend.kind && backend.kind !== "Service") continue;
          const svc = serviceByKey.get(`${backend.namespace ?? r.namespace}/${backend.name}`);
          if (svc) resourceEdges.push({ source: tail, target: svc.uid, healthy: true });
        }
        const tlsRefs = r.routeMetadata.tlsSecretRefs ?? [];
        if (r.routeMetadata.tlsEnabled || tlsRefs.length > 0) {
          resolveTls(r.uid, tlsRefs, r.routeMetadata.hostnames);
        }
      }

      // EndpointSlice resolves Service → Pod (the slice itself is not rendered).
      if (r.kind === RESOURCE_TYPE.ENDPOINTSLICE && r.endpointSliceMetadata?.serviceName) {
        const svc = serviceByKey.get(`${r.namespace}/${r.endpointSliceMetadata.serviceName}`);
        if (svc) {
          for (const ep of r.endpointSliceMetadata.endpoints ?? []) {
            if (ep.targetUID && resources.has(ep.targetUID)) {
              resourceEdges.push({ source: svc.uid, target: ep.targetUID, healthy: ep.ready });
            }
          }
        }
      }
    });

    // NetworkPolicies gate the pods they select: egress rules become edges, ingress rules go in a per-pod popover.
    const policyIngressByPod = new Map<string, PolicyIngressRule[]>();
    const policiesByPod = new Map<string, { uid: string; name: string }[]>();
    const peerNodeId = (raw: string) => `np-peer::${raw}`;
    const ensurePeerNode = (id: string, label: string, subtitle?: string): string => {
      if (!syntheticMeta.has(id)) {
        syntheticMeta.set(id, { type: "policyPeer", label, names: subtitle ? [subtitle] : undefined });
      }
      return id;
    };
    const selectorText = (sel: Record<string, string>): string =>
      Object.entries(sel)
        .map(([k, v]) => `${k}=${v}`)
        .join(",");
    // matchPods finds live Pods in a namespace whose labels satisfy a selector.
    const matchPods = (selector: Record<string, string>, namespace: string): KubeResource[] => {
      const entries = Object.entries(selector);
      const out: KubeResource[] = [];
      resources.forEach((pod) => {
        if (pod.kind !== RESOURCE_TYPE.POD || pod.namespace !== namespace) return;
        if (!entries.every(([k, v]) => pod.labels.get(k) === v)) return;
        out.push(pod);
      });
      return out;
    };
    // resolvePeers turns a rule's peer list into node ids; an empty list means "anywhere".
    const resolvePeers = (
      peers: { podSelector?: Record<string, string>; namespaceSelector?: Record<string, string>; ipBlock?: string }[] | undefined,
      policyNs: string,
    ): string[] => {
      if (!peers || peers.length === 0) {
        return [ensurePeerNode(peerNodeId("anywhere"), "Anywhere", "0.0.0.0/0")];
      }
      const ids: string[] = [];
      for (const peer of peers) {
        if (peer.ipBlock) {
          ids.push(ensurePeerNode(peerNodeId(`cidr::${peer.ipBlock}`), peer.ipBlock, "CIDR"));
        } else if (peer.namespaceSelector) {
          const ns = selectorText(peer.namespaceSelector) || "all namespaces";
          const pod = peer.podSelector ? ` · ${selectorText(peer.podSelector)}` : "";
          ids.push(ensurePeerNode(peerNodeId(`ns::${ns}${pod}`), `ns: ${ns}${pod}`, "Namespace selector"));
        } else if (peer.podSelector) {
          // Group the selector into one node (not one per pod) to keep gated pods aligned in ELK.
          const sel = selectorText(peer.podSelector) || "(any pod)";
          const count = matchPods(peer.podSelector, policyNs).length;
          const subtitle = count > 0 ? `${count} pod${count === 1 ? "" : "s"}` : "no live pods";
          ids.push(ensurePeerNode(peerNodeId(`pod::${policyNs}::${sel}`), sel, subtitle));
        }
      }
      return ids;
    };
    // describePeers is the textual counterpart of resolvePeers, used for the ingress popover.
    const describePeers = (
      peers: { podSelector?: Record<string, string>; namespaceSelector?: Record<string, string>; ipBlock?: string }[] | undefined,
      policyNs: string,
    ): string[] => {
      if (!peers || peers.length === 0) return ["Anywhere (0.0.0.0/0)"];
      const out: string[] = [];
      for (const peer of peers) {
        if (peer.ipBlock) {
          out.push(peer.ipBlock);
        } else if (peer.namespaceSelector) {
          const ns = selectorText(peer.namespaceSelector) || "all namespaces";
          const pod = peer.podSelector ? ` · ${selectorText(peer.podSelector)}` : "";
          out.push(`ns: ${ns}${pod}`);
        } else if (peer.podSelector) {
          const pods = matchPods(peer.podSelector, policyNs);
          out.push(pods.length > 0 ? pods.map((p) => p.name).join(", ") : `${selectorText(peer.podSelector) || "(any pod)"} (no live pods)`);
        }
      }
      return out;
    };

    for (const np of networkPolicies) {
      const meta = np.networkPolicyMetadata;
      const selector = Object.entries(meta?.podSelector ?? {});
      resources.forEach((pod) => {
        if (pod.kind !== RESOURCE_TYPE.POD || pod.namespace !== np.namespace) return;
        if (!selector.every(([k, v]) => pod.labels.get(k) === v)) return;
        policiesByPod.set(pod.uid, [...(policiesByPod.get(pod.uid) ?? []), { uid: np.uid, name: np.name }]);
        for (const rule of meta?.egress ?? []) {
          const label = portsLabel(rule.ports);
          for (const target of resolvePeers(rule.peers, np.namespace ?? "")) {
            if (target === pod.uid) continue;
            policyEdges.push({ source: pod.uid, target, anchor: pod.uid, direction: "egress", label });
          }
        }
        for (const rule of meta?.ingress ?? []) {
          const list = policyIngressByPod.get(pod.uid) ?? [];
          list.push({ sources: describePeers(rule.peers, np.namespace ?? ""), ports: portsLabel(rule.ports) || undefined });
          policyIngressByPod.set(pod.uid, list);
        }
      });
    }

    // Scope to the focus: keep only nodes on a path through a seed (its ancestors and descendants).
    const allEdges = [...internetEdges, ...resourceEdges];
    const forward = new Map<string, Set<string>>();
    const reverse = new Map<string, Set<string>>();
    const addDir = (map: Map<string, Set<string>>, from: string, to: string) => {
      if (!map.has(from)) map.set(from, new Set());
      map.get(from)!.add(to);
    };
    for (const e of allEdges) {
      addDir(forward, e.source, e.target);
      addDir(reverse, e.target, e.source);
    }

    // Seeds: the focus plus everything it owns, keeping only those that take part in the network graph.
    const networked = (uid: string) => forward.has(uid) || reverse.has(uid);
    const seeds = [...this.ownershipSubtree(focusId)].filter(networked);
    // Fall back to the focus itself so a lone resource still renders a node.
    const startIds = seeds.length > 0 ? seeds : [focusId];

    const reachable = (graph: Map<string, Set<string>>): Set<string> => {
      const seen = new Set<string>();
      const queue = [...startIds];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const next of graph.get(current) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      return seen;
    };

    const component = new Set<string>([...startIds, ...reachable(forward), ...reachable(reverse)]);

    // Fold in NetworkPolicy egress allowances for every gated pod in the component, pulling their peer nodes in.
    const keptPolicyEdges = policyEdges.filter((e) => component.has(e.anchor));
    for (const e of keptPolicyEdges) {
      component.add(e.source);
      component.add(e.target);
    }

    const keptEdges = allEdges.filter((e) => component.has(e.source) && component.has(e.target));
    const includeInternet = component.has(INTERNET_NODE_ID);

    // Deduplicate edges (multiple slices/refs can produce the same pair).
    const seen = new Set<string>();
    const edges: Edge[] = [];
    for (const e of keptEdges) {
      const id = `${e.source}->${e.target}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const color = e.healthy ? COLOR_HEALTHY : COLOR_UNHEALTHY;
      edges.push({
        id,
        source: e.source,
        target: e.target,
        // Bezier (default) rather than orthogonal: fan-out renders as distinct curves, not one bus.
        type: "default",
        animated: !e.healthy,
        label: e.label,
        labelStyle: { fill: "#a1a1aa", fontSize: 11 },
        labelBgStyle: { fill: "#18181b", fillOpacity: 0.85 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        style: { stroke: color, strokeDasharray: e.healthy ? undefined : "6 4" },
      });
    }

    // Policy edges render distinctly (dashed purple) and are deduped by direction+pair.
    const seenPolicy = new Set<string>();
    for (const e of keptPolicyEdges) {
      const id = `policy::${e.direction}::${e.source}->${e.target}`;
      if (seenPolicy.has(id)) continue;
      seenPolicy.add(id);
      const cue = e.direction === "egress" ? "⇥ egress" : "⇤ ingress";
      edges.push({
        id,
        source: e.source,
        target: e.target,
        type: "default",
        animated: false,
        label: e.label ? `${cue} ${e.label}` : cue,
        labelStyle: { fill: "#c4b5fd", fontSize: 10 },
        labelBgStyle: { fill: "#18181b", fillOpacity: 0.85 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        style: { stroke: COLOR_POLICY, strokeDasharray: "4 3" },
      });
    }

    const nodes: Node<NetworkNodeData>[] = [];
    if (includeInternet) {
      nodes.push({ id: INTERNET_NODE_ID, type: "internet", data: {}, position: { x: 0, y: 0 } });
    }
    for (const uid of component) {
      const resource = resources.get(uid);
      if (resource) {
        const policies = policiesByPod.get(uid);
        nodes.push({
          id: uid,
          type: this.nodeTypeFor(resource),
          data: {
            treeNode: resource,
            tls: tlsByNode.get(uid),
            policy: policies ? { policies, ingress: policyIngressByPod.get(uid) ?? [] } : undefined,
          },
          position: { x: 0, y: 0 },
        });
        continue;
      }
      const meta = syntheticMeta.get(uid);
      if (meta) {
        nodes.push({
          id: uid,
          type: meta.type,
          data: { label: meta.label, names: meta.names },
          position: { x: 0, y: 0 },
        });
      }
    }

    return { nodes, edges };
  }

  // ownershipSubtree returns the focus UID plus every resource it owns, following the flux ownership tree.
  private ownershipSubtree(focusId: string): Set<string> {
    const result = new Set<string>([focusId]);
    const root = this.fluxTreeStore.resources.get(focusId);
    if (!root) return result;
    const stack: KubeResource[] = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      for (const child of node.children ?? []) {
        if (!result.has(child.uid)) {
          result.add(child.uid);
          stack.push(child);
        }
      }
    }
    return result;
  }

  private nodeTypeFor(resource: KubeResource): string {
    switch (resource.kind) {
      case RESOURCE_TYPE.POD:
        return "pod";
      case RESOURCE_TYPE.DEPLOYMENT:
        return "deployment";
      default:
        return "resource";
    }
  }
}
