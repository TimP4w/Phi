import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Handle, NodeProps, Position, Node } from "@xyflow/react";
import { Lock, ShieldAlert } from "lucide-react";
import { Popover } from "@heroui/react";
import { KubeResource } from "../../../core/fluxTree/models/tree";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import {
  NetworkNodeData,
  NetworkTLSInfo,
  PolicyConstraints,
} from "../../../core/network/usecases/NetworkTopology.usecase";
import AppLogo from "../resource-icon/ResourceIcon";
import StatusChip from "../status-chip/StatusChip";
import { NETWORK_SUBPATH, ROUTES } from "../../routes/routes.enum";

type NetworkResourceNodeProps = NodeProps<Node<NetworkNodeData>>;

// Whole days from now until an ISO timestamp; null when unparseable.
export function daysUntil(iso: string): number | null {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return Number.isNaN(days) ? null : days;
}

export function networkDetail(node: KubeResource): string | null {
  if (node.kind === RESOURCE_TYPE.SERVICE && node.serviceMetadata) {
    const meta = node.serviceMetadata;
    const type = meta.type ?? "";
    const ips =
      meta.externalIPs?.join(", ") ?? meta.clusterIPs?.join(", ") ?? "";
    const ports = (meta.ports ?? [])
      .map((p) => {
        const proto = p.protocol ?? "TCP";
        const tp =
          p.targetPort && p.targetPort !== String(p.port)
            ? `→${p.targetPort}`
            : "";
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
  if (node.routeMetadata) {
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
    <Popover>
      <Popover.Trigger>
        <button
          aria-label="TLS details"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-success hover:text-success hover:bg-success/10 transition-colors cursor-pointer flex-shrink-0"
        >
          <Lock className="w-3.5 h-3.5" />
          TLS
        </button>
      </Popover.Trigger>
      <Popover.Content
        placement="top"
        className="rounded-lg border-small border-default-100 shadow-xl"
      >
        <div className="px-3 py-2.5 text-xs space-y-1 max-w-[280px]">
          <p className="text-sm font-semibold">TLS terminated</p>
          {tls.certName ? (
            <p>
              Certificate:{" "}
              <Link
                to={`${ROUTES.RESOURCE}/${tls.certUid}`}
                className="text-foreground hover:underline"
              >
                {tls.certName}
              </Link>
            </p>
          ) : (
            <p className="text-muted">
              No cert-manager Certificate found
            </p>
          )}
          {tls.issuer && <p>Issuer: {tls.issuer}</p>}
          {tls.notAfter && (
            <p>
              Expires: {new Date(tls.notAfter).toLocaleDateString()}
              {days != null && ` (${days}d)`}
            </p>
          )}
          {tls.ready != null && (
            <p className={tls.ready ? "text-success" : "text-danger"}>
              {tls.ready ? "Ready" : "NOT READY"}
            </p>
          )}
          {tls.secretName && (
            <p>
              Secret:{" "}
              {tls.secretUid ? (
                <Link
                  to={`${ROUTES.RESOURCE}/${tls.secretUid}`}
                  className="text-foreground hover:underline"
                >
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
      </Popover.Content>
    </Popover>
  );
}

// PolicyConstraintsPopover flags that NetworkPolicies gate a pod
function PolicyConstraintsPopover({ policy }: { policy: PolicyConstraints }) {
  return (
    <Popover>
      <Popover.Trigger>
        <button
          aria-label="Network policy constraints"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted hover:text-muted hover:bg-accent/10 transition-colors cursor-pointer flex-shrink-0"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          {policy.policies.length}
        </button>
      </Popover.Trigger>
      <Popover.Content
        placement="top"
        className="rounded-lg border-small border-default-100 shadow-xl"
      >
        <div className="px-3 py-2.5 text-xs space-y-2 max-w-[280px]">
          <p className="text-sm font-semibold">Network policies in effect</p>
          <div className="space-y-0.5">
            {policy.policies.map((p) => (
              <p key={p.uid}>
                <Link
                  to={`${ROUTES.RESOURCE}/${p.uid}`}
                  className="text-foreground hover:underline break-words"
                >
                  {p.name}
                </Link>
              </p>
            ))}
          </div>
          {policy.ingress.length > 0 && (
            <div className="space-y-1 border-t border-border pt-1.5">
              <p className="font-semibold">Allowed ingress</p>
              {policy.ingress.map((rule, i) => (
                <div key={i} className="space-y-0.5">
                  <p className="text-muted">
                    {rule.ports ? rule.ports : "all ports"}
                  </p>
                  {rule.sources.map((src, j) => (
                    <p key={j} className="break-words pl-2">
                      ⇤ {src}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
          <p className="text-muted border-t border-border pt-1.5">
            Egress shown as edges →
          </p>
        </div>
      </Popover.Content>
    </Popover>
  );
}

function NetworkResourceNode({ data }: NetworkResourceNodeProps) {
  const d = data as {
    treeNode?: KubeResource;
    tls?: NetworkTLSInfo;
    policy?: PolicyConstraints;
  };
  const treeNode = d.treeNode;
  const detail = useMemo(
    () => (treeNode ? networkDetail(treeNode) : null),
    [treeNode],
  );

  if (!treeNode) return null;

  const policy = d.policy;

  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} />
      <div className="w-[240px] bg-surface border border-border rounded-lg shadow-sm">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="flex-shrink-0">
            <AppLogo groupKind={treeNode.groupKind} />
          </div>
          <div className="flex-1 min-w-0">
            <Link
              to={`${ROUTES.RESOURCE}/${treeNode.uid}/${NETWORK_SUBPATH}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-semibold truncate block hover:text-foreground transition-colors leading-tight"
            >
              {treeNode.name}
            </Link>
            <p className="text-xs text-muted leading-tight mt-0.5">
              {treeNode.kind}
              {treeNode.namespace ? ` · ${treeNode.namespace}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {policy && <PolicyConstraintsPopover policy={policy} />}
            <StatusChip resource={treeNode} />
          </div>
        </div>
        {(detail || d.tls) && (
          <div className="px-3 pb-2 border-t border-border pt-1.5 flex items-center gap-1.5">
            {detail && (
              <p className="text-xs text-muted truncate flex-1 min-w-0">
                {detail}
              </p>
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
