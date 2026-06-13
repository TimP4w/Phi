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

// TLS termination details surfaced on a route/gateway node (shown in a popover
// from the lock indicator instead of as separate cert/secret nodes).
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

// Node data is either a real Kubernetes resource (optionally with TLS info), a
// synthetic layer node (an external IP, an entrypoint, or a middleware "wall"
// carrying a label and optional names), or the empty internet node.
export type NetworkNodeData =
  | { treeNode: KubeResource; tls?: NetworkTLSInfo }
  | { label: string; names?: string[] }
  | Record<string, never>;

type Output = { nodes: Node<NetworkNodeData>[]; edges: Edge[] };
type Input = { nodeId: string };

// A logical traffic edge before layout. `healthy` drives the edge styling;
// `label` annotates how/where traffic flows (e.g. the access method).
type LogicalEdge = { source: string; target: string; healthy: boolean; label?: string };

// A context edge attaches side metadata (TLS secret/cert) to an `anchor` route
// or gateway; kept only when the anchor is in the focused component.
type ContextEdge = LogicalEdge & { anchor: string };

// dnsMatches reports whether a hostname is covered by a certificate DNS name,
// supporting a single leading wildcard label (e.g. *.example.com ⊇ app.example.com).
function dnsMatches(host: string, pattern: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".example.com"
    return host.endsWith(suffix) && !host.slice(0, host.length - suffix.length).includes(".");
  }
  return false;
}

// npLabel summarises a NetworkPolicy's gated directions for an edge label.
function npLabel(np: KubeResource): string {
  const types = np.networkPolicyMetadata?.policyTypes ?? [];
  return types.length > 0 ? `NetPol · ${types.join("/")}` : "NetworkPolicy";
}

// entrypointLabel describes how external traffic reaches a Service entrypoint.
function entrypointLabel(service: KubeResource): string {
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

function gatewayLabel(gateway: KubeResource): string {
  const meta = gateway.gatewayMetadata;
  if (!meta) return "Gateway";
  const addrs = (meta.addresses ?? []).join(", ") || "pending address";
  const ports = (meta.listeners ?? []).map((l) => l.port).filter(Boolean).join(", ");
  return `Gateway · ${addrs}${ports ? ` · :${ports}` : ""}`;
}

const ROUTE_KINDS = new Set<string>([
  RESOURCE_TYPE.INGRESS,
  RESOURCE_TYPE.INGRESSROUTE,
  RESOURCE_TYPE.HTTPROUTE,
]);

const COLOR_HEALTHY = "#17c964"; // heroui success
const COLOR_UNHEALTHY = "#f5a524"; // heroui warning

@injectable()
export class NetworkTopologyUseCase extends UseCase<Input, Promise<Output>> {
  private elk = new ELK();
  private elkOptions = {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
    "elk.layered.spacing.nodeNodeBetweenLayers": "120",
    "elk.spacing.nodeNode": "32",
    // Orthogonal (right-angle) edges and aggressive crossing/alignment passes make
    // a wide fan-out followable instead of a tangle of diagonal lines.
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

  // buildFocusedGraph resolves the traffic chain reachable from the focus
  // resource. The internet node is attached only to entrypoints that already
  // belong to the focused component, so a single focus does not pull in every
  // unrelated entrypoint through the shared internet hub.
  private buildFocusedGraph(focusId: string): { nodes: Node<NetworkNodeData>[]; edges: Edge[] } {
    const resources = this.fluxTreeStore.resources;

    const serviceByKey = new Map<string, KubeResource>();
    const gatewayByKey = new Map<string, KubeResource>();
    const gatewayClassByName = new Map<string, KubeResource>();
    const secretByKey = new Map<string, KubeResource>();
    const certBySecretKey = new Map<string, KubeResource>();
    // All Certificates, for matching a route's hostnames to a cert's DNS names
    // when the route terminates TLS but names no secret (wildcard / default cert).
    const certificates: KubeResource[] = [];
    const networkPolicies: KubeResource[] = [];
    // Entrypoint name -> middleware refs applied to all its traffic (aggregated
    // from every proxy workload's ProxyMetadata).
    const entrypointMiddlewares = new Map<string, string[]>();
    // Synthetic layer nodes that aren't Kubernetes resources: external IPs,
    // entrypoints, and middleware walls. These give the topology real columns to
    // follow instead of collapsing everything onto one Service node.
    const syntheticMeta = new Map<
      string,
      { type: "externalIp" | "entrypoint" | "middlewareWall"; label: string; names?: string[] }
    >();
    const ipNodeId = (ip: string) => `ip::${ip}`;
    const entrypointNodeId = (lbUid: string, ep: string) => `ep::${lbUid}::${ep}`;

    // Vendor-specific ref handling is delegated to providers; the builder itself
    // stays controller-agnostic. Instantiated per build so their indexes are fresh.
    const providers: NetworkProvider[] = [new TraefikProvider()];
    const middlewareName = (ref: string): string => {
      for (const p of providers) {
        const resolved = p.resolveMiddleware(ref);
        if (resolved) return resolved.name;
      }
      return ref;
    };
    // Index LoadBalancer Services by their external address so a route can be
    // linked to the ingress controller's Service that actually fronts it.
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
    // Context edges hang side metadata (currently NetworkPolicies) off an anchor
    // node. Kept only when the anchor is in the focused component.
    const contextEdges: ContextEdge[] = [];

    // TLS info per route/gateway, surfaced in the node's lock popover rather than
    // as separate cert/secret nodes (which cluttered the graph).
    const tlsByNode = new Map<string, NetworkTLSInfo>();

    // resolveTls finds the certificate backing a route/gateway: first by the TLS
    // secret it names, then (for secret-less routes) by matching its hostnames to
    // a certificate's DNS names (wildcard/default cert the proxy serves).
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

    // entrypointExit returns the node routes should attach from: the entrypoint's
    // own middleware wall when it has entrypoint-level middlewares, else the
    // entrypoint node itself. The wall is built once per entrypoint.
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
      // Entrypoints exposed to the internet. LoadBalancers get an explicit
      // external-IP node per address (Internet → IP → loadbalancer) so multiple
      // IPs/LBs branch cleanly; NodePort services attach to the internet directly.
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

      // Routes: attached to a Gateway (Gateway API), fronted by the ingress
      // controller's LoadBalancer Service (matched on external address), or — as
      // a last resort — drawn straight from the internet.
      if (ROUTE_KINDS.has(r.kind) && r.routeMetadata) {
        const parentRefs = r.routeMetadata.routeParentRefs ?? [];
        // Controller-agnostic "which door" label: the route's named entrypoints
        // (Traefik), else its ingressClass (how nginx/caddy split internal vs
        // external), else its hostnames. Nothing here assumes a Traefik cluster.
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
          // Match the controller's LB Service via the route's own external address,
          // then route through an entrypoint node per entrypoint the route binds
          // to (loadbalancer → websecure → ingress). This groups the many ingresses
          // by entrypoint instead of fanning them all off the single LB node.
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
        // Route-level middlewares render as one "wall" node listing their names,
        // sitting between the route and its backend services.
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

    // NetworkPolicies gate the pods they select (same namespace). Attached as
    // context anchored to each gated pod, so they show when the pod is in view
    // without a shared policy dragging in every pod it matches.
    for (const np of networkPolicies) {
      const selector = Object.entries(np.networkPolicyMetadata?.podSelector ?? {});
      resources.forEach((pod) => {
        if (pod.kind !== RESOURCE_TYPE.POD || pod.namespace !== np.namespace) return;
        if (!selector.every(([k, v]) => pod.labels.get(k) === v)) return;
        contextEdges.push({
          source: np.uid,
          target: pod.uid,
          healthy: true,
          label: npLabel(np),
          anchor: pod.uid,
        });
      });
    }

    // Scope to the focus by following traffic direction: keep only nodes on a
    // path through a seed — its ancestors (what reaches it) and descendants
    // (what it reaches). This stops a shared entrypoint (e.g. the Traefik LB
    // Service) from dragging in every sibling route that also hangs off it.
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

    // Seeds: the focus plus everything it owns (flux ownership subtree). Focusing
    // a Kustomization/HelmRelease/Deployment thus renders the union of the
    // traffic chains of every Pod/Service/route it owns — the complete tree.
    // Only seeds that actually take part in the network graph are kept, so owned
    // ConfigMaps/Secrets/etc. do not appear as isolated nodes.
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

    // Fold in context (TLS secrets/certs) for every anchor already in the
    // component, so a route's TLS provenance shows even when focusing a pod.
    const keptContextEdges = contextEdges.filter((e) => component.has(e.anchor));
    for (const e of keptContextEdges) {
      component.add(e.source);
      component.add(e.target);
    }

    const keptEdges = [
      ...allEdges.filter((e) => component.has(e.source) && component.has(e.target)),
      ...keptContextEdges,
    ];
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
        // Bezier (default) rather than orthogonal: a node fanning out to several
        // stacked targets renders as distinct curves instead of overlapping
        // vertical segments that look like one bus linking the targets.
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

    const nodes: Node<NetworkNodeData>[] = [];
    if (includeInternet) {
      nodes.push({ id: INTERNET_NODE_ID, type: "internet", data: {}, position: { x: 0, y: 0 } });
    }
    for (const uid of component) {
      const resource = resources.get(uid);
      if (resource) {
        nodes.push({
          id: uid,
          type: this.nodeTypeFor(resource),
          data: { treeNode: resource, tls: tlsByNode.get(uid) },
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

  // ownershipSubtree returns the focus UID plus every resource it owns,
  // following the flux ownership tree (children populated from ownerReferences /
  // flux labels). Used to expand an owner (Kustomization, HelmRelease,
  // Deployment, …) into all of its networked resources.
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
