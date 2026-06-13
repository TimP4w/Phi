import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Handle, NodeProps, Position, Node } from "@xyflow/react";
import { Lock } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/react";
import { KubeResource } from "../../../core/fluxTree/models/tree";
import { RESOURCE_TYPE, ROUTE_KINDS } from "../../../core/fluxTree/constants/resources.const";
import { NetworkNodeData, NetworkTLSInfo } from "../../../core/network/usecases/NetworkTopology.usecase";
import AppLogo from "../resource-icon/ResourceIcon";
import StatusChip from "../status-chip/StatusChip";
import { NETWORK_SUBPATH, ROUTES } from "../../routes/routes.enum";

type NetworkResourceNodeProps = NodeProps<Node<NetworkNodeData>>;

// Whole days from now until an ISO timestamp; null when unparseable.
function daysUntil(iso: string): number | null {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return Number.isNaN(days) ? null : days;
}

function networkDetail(node: KubeResource): string | null {
  if (node.kind === RESOURCE_TYPE.SERVICE && node.serviceMetadata) {
    const meta = node.serviceMetadata;
    const type = meta.type ?? "";
    const ips =
      meta.externalIPs?.join(", ") ?? meta.clusterIPs?.join(", ") ?? "";
    const ports = (meta.ports ?? [])
      .map((p) => {
        const proto = p.protocol ?? "TCP";
        const tp = p.targetPort && p.targetPort !== String(p.port) ? `→${p.targetPort}` : "";
        const np = p.nodePort ? ` (node ${p.nodePort})` : "";
        return `${proto} ${p.port}${tp}${np}`;
      })
      .join(", ");
    return [type, ips, ports].filter(Boolean).join(" · ") || null;
  }
  if (node.kind === RESOURCE_TYPE.GATEWAY && node.gatewayMetadata) {
    const className = node.gatewayMetadata.gatewayClassName ?? "";
    const addr = node.gatewayMetadata.addresses?.join(", ") ?? "";
    return [className, addr].filter(Boolean).join(" · ") || null;
  }
  if (ROUTE_KINDS.has(node.kind) && node.routeMetadata) {
    return node.routeMetadata.hostnames?.join(", ") || null;
  }
  if (node.kind === RESOURCE_TYPE.CERTIFICATE && node.certificateMetadata) {
    const m = node.certificateMetadata;
    const parts: string[] = [];
    if (m.issuer) parts.push(m.issuer);
    if (m.notAfter) {
      const days = daysUntil(m.notAfter);
      if (days != null) parts.push(`expires ${days}d`);
    }
    parts.push(m.ready ? "Ready" : "NOT READY");
    return parts.join(" · ") || null;
  }
  if (node.kind === RESOURCE_TYPE.NETWORKPOLICY && node.networkPolicyMetadata) {
    const m = node.networkPolicyMetadata;
    const types = (m.policyTypes ?? []).join("/");
    const rules = `${m.ingressRules ?? 0} in / ${m.egressRules ?? 0} eg`;
    return [types, rules].filter(Boolean).join(" · ") || null;
  }
  return null;
}

function TLSLockPopover({ tls }: { tls: NetworkTLSInfo }) {
  const days = tls.notAfter ? daysUntil(tls.notAfter) : null;
  return (
    <Popover placement="top" showArrow>
      <PopoverTrigger>
        <button
          aria-label="TLS details"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-success-600 hover:text-success-500 hover:bg-success-500/10 transition-colors cursor-pointer flex-shrink-0"
        >
          <Lock className="w-3.5 h-3.5" />
          TLS
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="px-1 py-2 text-xs space-y-1 max-w-[280px]">
          <p className="text-sm font-semibold">TLS terminated</p>
          {tls.certName ? (
            <p>
              Certificate:{" "}
              <Link to={`${ROUTES.RESOURCE}/${tls.certUid}`} className="text-primary hover:underline">
                {tls.certName}
              </Link>
            </p>
          ) : (
            <p className="text-default-400">No cert-manager Certificate found</p>
          )}
          {tls.issuer && <p>Issuer: {tls.issuer}</p>}
          {tls.notAfter && (
            <p>
              Expires: {new Date(tls.notAfter).toLocaleDateString()}
              {days != null && ` (${days}d)`}
            </p>
          )}
          {tls.ready != null && (
            <p className={tls.ready ? "text-success-500" : "text-danger"}>
              {tls.ready ? "Ready" : "NOT READY"}
            </p>
          )}
          {tls.secretName && (
            <p>
              Secret:{" "}
              {tls.secretUid ? (
                <Link to={`${ROUTES.RESOURCE}/${tls.secretUid}`} className="text-primary hover:underline">
                  {tls.secretName}
                </Link>
              ) : (
                tls.secretName
              )}
            </p>
          )}
          {tls.dnsNames && tls.dnsNames.length > 0 && (
            <p className="break-words">DNS: {tls.dnsNames.join(", ")}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NetworkResourceNode({ data }: NetworkResourceNodeProps) {
  const d = data as { treeNode?: KubeResource; tls?: NetworkTLSInfo };
  const treeNode = d.treeNode;
  const detail = useMemo(() => (treeNode ? networkDetail(treeNode) : null), [treeNode]);

  if (!treeNode) return null;

  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} />
      <div className="w-[240px] bg-content1 border border-default-200 rounded-lg shadow-sm">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="flex-shrink-0">
            <AppLogo kind={treeNode.kind} />
          </div>
          <div className="flex-1 min-w-0">
            <Link
              to={`${ROUTES.RESOURCE}/${treeNode.uid}/${NETWORK_SUBPATH}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-semibold truncate block hover:text-primary transition-colors leading-tight"
            >
              {treeNode.name}
            </Link>
            <p className="text-xs text-default-500 leading-tight mt-0.5">
              {treeNode.kind}
              {treeNode.namespace ? ` · ${treeNode.namespace}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <StatusChip resource={treeNode} />
          </div>
        </div>
        {(detail || d.tls) && (
          <div className="px-3 pb-2 border-t border-default-100 pt-1.5 flex items-center gap-1.5">
            {detail && (
              <p className="text-xs text-default-500 truncate flex-1 min-w-0">{detail}</p>
            )}
            {d.tls && (
              <div className={detail ? "flex-shrink-0" : "ml-auto"}>
                <TLSLockPopover tls={d.tls} />
              </div>
            )}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default NetworkResourceNode;
