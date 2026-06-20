import {
  FluxResource,
  KubeResource,
  Kustomization,
  ResourceStatus,
} from "../../../core/fluxTree/models/tree";
import {
  FLUX_APPLICATION_KINDS,
  FLUX_REPOSITORY_KINDS,
} from "../../../core/fluxTree/constants/resources.const";
import { HealthTone } from "./HealthButton";

const APP_KINDS = new Set<string>(FLUX_APPLICATION_KINDS);
const SOURCE_KINDS = new Set<string>(FLUX_REPOSITORY_KINDS);

export type ReconciliationData = {
  apps: KubeResource[];
  sources: KubeResource[];
  failed: number;
  reconciling: number;
  suspended: number;
  drift: number;
  sourcesFailed: number;
  tone: HealthTone;
  label: string;
};

/** Walk a subtree, summarising its Flux objects' reconcile state into a HealthButton tone + label. */
export function computeReconciliation(
  root: KubeResource | undefined,
): ReconciliationData {
  const apps: KubeResource[] = [];
  const sources: KubeResource[] = [];
  if (root) {
    const visited = new Set<string>();
    const walk = (n: KubeResource | null) => {
      if (!n || visited.has(n.uid)) return;
      visited.add(n.uid);
      if (APP_KINDS.has(n.kind)) apps.push(n);
      else if (SOURCE_KINDS.has(n.kind)) sources.push(n);
      for (const c of n.children || []) walk(c);
    };
    walk(root);
  }

  const failed = apps.filter((a) => a.status === ResourceStatus.FAILED).length;
  const reconciling = apps.filter(
    (a) => a.status === ResourceStatus.PENDING || a.status === ResourceStatus.WARNING,
  ).length;
  const suspended = apps.filter((a) => a instanceof FluxResource && a.isSuspended).length;
  const drift = apps.filter(
    (a) =>
      a instanceof Kustomization &&
      !!a.metadata?.lastAppliedRevision &&
      !!a.metadata?.lastAttemptedRevision &&
      a.metadata.lastAppliedRevision !== a.metadata.lastAttemptedRevision,
  ).length;
  const sourcesFailed = sources.filter((s) => s.status === ResourceStatus.FAILED).length;

  const tone: HealthTone =
    failed > 0 || sourcesFailed > 0
      ? "danger"
      : reconciling > 0 || drift > 0
        ? "warning"
        : "success";
  const label =
    failed > 0
      ? `${failed} failed${reconciling > 0 ? ` · ${reconciling} reconciling` : ""}`
      : sourcesFailed > 0
        ? `${sourcesFailed} source${sourcesFailed > 1 ? "s" : ""} failed`
        : reconciling > 0
          ? `${reconciling} reconciling`
          : drift > 0
            ? `${drift} out of sync`
            : "All reconciled";

  return { apps, sources, failed, reconciling, suspended, drift, sourcesFailed, tone, label };
}
