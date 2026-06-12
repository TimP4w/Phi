import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  VisualizationNodeData,
  ResourceStatus,
  KubeResource,
  FluxResource,
  Kustomization,
  HelmRelease,
  GitRepository,
  OCIRepository,
  Deployment,
  Pod,
  PersistentVolumeClaim,
} from "../../../core/fluxTree/models/tree";
import AppLogo from "../resource-icon/ResourceIcon";
import StatusChip from "../status-chip/StatusChip";
import { Handle, NodeProps, Position, Node } from "@xyflow/react";
import { ROUTES } from "../../routes/routes.enum";
import { Pause } from "lucide-react";

type ResourceProps = NodeProps<Node<VisualizationNodeData>>;

const ACCESS_MODE_SHORT: Record<string, string> = {
  ReadWriteOnce: "RWO",
  ReadOnlyMany: "ROX",
  ReadWriteMany: "RWX",
  ReadWriteOncePod: "RWOP",
};

function getExtraInfo(node: KubeResource): string | null {
  if (node instanceof Deployment) {
    const ready = node.metadata?.readyReplicas ?? 0;
    const total = node.metadata?.replicas ?? 0;
    return `${ready}/${total} replicas`;
  }

  if (node instanceof Pod) {
    const phase = node.metadata?.phase ?? null;
    const image = node.metadata?.image
      ? node.metadata.image.split("/").pop()?.split(":").join(" · ") ?? null
      : null;
    return [phase, image].filter(Boolean).join("  ·  ") || null;
  }

  if (node instanceof HelmRelease) {
    if (!node.metadata) return null;
    const chart = node.metadata.chartName;
    const ver = node.metadata.chartVersion ? `v${node.metadata.chartVersion}` : "";
    const src = node.metadata.sourceRef?.name ? `← ${node.metadata.sourceRef.name}` : "";
    return [chart, ver, src].filter(Boolean).join(" ");
  }

  if (node instanceof Kustomization) {
    if (!node.metadata) return null;
    const src = node.metadata.sourceRef?.name ?? "";
    const path = node.metadata.path && node.metadata.path !== "/" ? node.metadata.path : "";
    const rev = node.getLastAttemptedHash().slice(0, 7);
    return [[src, path].filter(Boolean).join(" · "), rev].filter(Boolean).join("  @");
  }

  if (node instanceof GitRepository) {
    const url = node.getURL().replace(/^https?:\/\//, "").replace(/\.git$/, "");
    const ref = node.getCode(); // already prefixed with @ or :
    return [url, ref].filter(Boolean).join("") || null;
  }

  if (node instanceof OCIRepository) {
    const url = node.getURL().replace(/^oci:\/\//, "");
    const ref = node.getCode();
    return [url, ref].filter(Boolean).join("") || null;
  }

  if (node instanceof PersistentVolumeClaim) {
    const phase = node.metadata?.phase ?? "";
    const sc = node.metadata?.storageClass ?? "";
    const capacity = node.metadata?.capacity instanceof Map
      ? node.metadata.capacity.get("storage") ?? ""
      : "";
    const mode = node.metadata?.accessModes?.[0]
      ? (ACCESS_MODE_SHORT[node.metadata.accessModes[0]] ?? node.metadata.accessModes[0])
      : "";
    return [phase, sc, capacity, mode].filter(Boolean).join(" · ") || null;
  }

  return null;
}

function Resource({ data }: ResourceProps) {
  const treeNode = data.treeNode;

  const extraInfo = useMemo(() => getExtraInfo(treeNode), [treeNode]);

  const failureMessage = useMemo(() => {
    if (treeNode.status !== ResourceStatus.FAILED && treeNode.status !== ResourceStatus.WARNING) {
      return null;
    }
    return treeNode.conditions.find((c) => !c.status)?.message ?? null;
  }, [treeNode]);

  const isSuspended = treeNode instanceof FluxResource && treeNode.isSuspended;

  const hasFooter = !!(failureMessage || extraInfo || isSuspended);

  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} />

      <div className="w-[240px] bg-content1 border border-default-200 rounded-lg shadow-sm">
        {/* Main row */}
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="flex-shrink-0">
            <AppLogo kind={treeNode.kind} />
          </div>
          <div className="flex-1 min-w-0">
            <Link
              to={`${ROUTES.RESOURCE}/${treeNode.uid}`}
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
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <StatusChip resource={treeNode} />
            {isSuspended && (
              <span className="flex items-center gap-0.5 text-[10px] text-default-400">
                <Pause className="w-2.5 h-2.5" />
                Paused
              </span>
            )}
          </div>
        </div>

        {/* Footer: type-specific info or failure message */}
        {hasFooter && (
          <div className="px-3 pb-2 border-t border-default-100 pt-1.5">
            {failureMessage ? (
              <p className="text-xs text-danger line-clamp-2 leading-snug">{failureMessage}</p>
            ) : (
              <p className="text-xs text-default-500 truncate">{extraInfo}</p>
            )}
          </div>
        )}
      </div>

      {treeNode.children.length > 0 && (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}

export default Resource;
