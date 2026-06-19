import { ReactNode, useState } from "react";
import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { Progress, useDisclosure } from "@heroui/react";
import {
  Bell,
  Boxes,
  ChevronDown,
  FileWarning,
  GitBranch,
  HardDrive,
  Lock,
  Network,
  Server,
  ShieldAlert,
  X,
} from "lucide-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { EventsStore } from "../../../core/fluxTree/stores/events.store";
import EventsPanel, { EventFilter } from "../events/EventsPanel";
import {
  KubeResource,
  LonghornNode,
  LonghornVolume,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  ResourceStatus,
} from "../../../core/fluxTree/models/tree";
import { FLUX_KINDS, RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import {
  SeverityCounts,
  clusterSummary,
  totalCves,
  totalOther,
} from "../../../core/trivy/trivy";
import { formatBytes, usageColor, usagePercent } from "../../shared/format";
import ResourceCountWidget from "../widgets/ResourcesCountWidget";
import LonghornVolumesModal from "../widgets/LonghornVolumesModal";
import TrivyFindingsModal from "../widgets/TrivyFindingsModal";
import NodesModal from "./NodesModal";
import ResourceListModal from "./ResourceListModal";
import HealthButton from "./HealthButton";
import { computeReconciliation } from "./reconciliation";

type Tone = "default" | "success" | "warning" | "danger";

const DOT: Record<Tone, string> = {
  default: "bg-default-300",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** A collapsible section: dot + icon + title + a right-hand number, expanding to detail. */
const Section: React.FC<{
  icon: ReactNode;
  title: string;
  tone: Tone;
  summary: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}> = ({ icon, title, tone, summary, defaultOpen, children }) => {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border-b border-default-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-content2/50 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[tone]}`} />
        <span className="text-default-400 flex-shrink-0">{icon}</span>
        <span className="text-sm font-medium flex-1 text-left">{title}</span>
        <span className="flex items-center gap-2">{summary}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-default-400 transition-transform flex-shrink-0 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && <div className="px-4 pb-3 pt-0.5">{children}</div>}
    </div>
  );
};

/** A provider-labelled block inside a section (e.g. "Longhorn", "Kubernetes"). */
const Block: React.FC<{ title: string; provider?: string; children: ReactNode }> = ({
  title,
  provider,
  children,
}) => (
  <div className="mb-3 last:mb-0">
    <div className="flex items-baseline gap-1.5 mb-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-default-300">
        {title}
      </span>
      {provider && <span className="text-[10px] text-default-400">· {provider}</span>}
    </div>
    {children}
  </div>
);

const ViewAll: React.FC<{ onClick: () => void; children: ReactNode }> = ({
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="text-xs text-primary hover:underline mt-2"
  >
    {children} →
  </button>
);

const Stat: React.FC<{ label: string; value: ReactNode; tone?: string }> = ({
  label,
  value,
  tone = "text-foreground",
}) => (
  <div className="flex justify-between items-center text-xs">
    <span className="text-default-400">{label}</span>
    <span className={`font-medium tabular-nums ${tone}`}>{value}</span>
  </div>
);

/** Right-hand summary: a count, plus an optional coloured "what's wrong" accent. */
const Count: React.FC<{ value: number; label?: string; accent?: ReactNode }> = ({
  value,
  label,
  accent,
}) => (
  <>
    <span className="text-sm font-semibold tabular-nums">{value}</span>
    {label && <span className="text-xs text-default-400">{label}</span>}
    {accent}
  </>
);

const Danger: React.FC<{ children: ReactNode }> = ({ children }) => (
  <span className="text-xs font-medium text-danger">{children}</span>
);

// Flux kinds with their colours, for the reconciliation breakdown bars.
const FLUX_KIND_CONFIG: { label: string; kind: string; color: string }[] = [
  { label: "Kustomizations", kind: RESOURCE_TYPE.KUSTOMIZATION, color: "#66AAF9" },
  { label: "HelmReleases", kind: RESOURCE_TYPE.HELM_RELEASE, color: "#AE7EDE" },
  { label: "HelmCharts", kind: RESOURCE_TYPE.HELM_CHART, color: "#DDB414" },
  { label: "HelmRepositories", kind: RESOURCE_TYPE.HELM_REPOSITORY, color: "#74DFA2" },
  { label: "GitRepositories", kind: RESOURCE_TYPE.GIT_REPOSITORY, color: "#F871A0" },
  { label: "OCIRepositories", kind: RESOURCE_TYPE.OCI_REPOSITORY, color: "#FF95E1" },
  { label: "Buckets", kind: RESOURCE_TYPE.BUCKET, color: "#C3F4FD" },
];

/** Per-kind count + proportion bars for a set of Flux objects. */
const KindBars: React.FC<{ resources: KubeResource[] }> = ({ resources }) => {
  const total = resources.length;
  return (
    <div className="flex flex-col gap-1">
      {FLUX_KIND_CONFIG.map(({ label, kind, color }) => {
        const count = resources.filter((r) => r.kind === kind).length;
        if (count === 0) return null;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={kind} className="flex items-center gap-2.5">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-default-400 flex-1 min-w-0 truncate">{label}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-16 h-1 bg-default-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-xs font-mono text-default-400 w-4 text-right tabular-nums">
                {count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
const Warn: React.FC<{ children: ReactNode }> = ({ children }) => (
  <span className="text-xs font-medium text-warning">{children}</span>
);

type Counts = { total: number; ready: number; problem: number };

function countTree(root: KubeResource | undefined, exclude?: Set<string>): Counts {
  const c: Counts = { total: 0, ready: 0, problem: 0 };
  if (!root) return c;
  const visited = new Set<string>();
  const walk = (node: KubeResource | null) => {
    if (!node || visited.has(node.uid)) return;
    visited.add(node.uid);
    // Excluded kinds (Flux objects) don't count, but their children do.
    if (exclude?.has(node.kind)) {
      for (const child of node.children || []) walk(child);
      return;
    }
    c.total++;
    if (node.status === ResourceStatus.SUCCESS) c.ready++;
    // Reconciling (PENDING) is a healthy transient state; only hard problems count as unhealthy.
    else if (
      node.status === ResourceStatus.FAILED ||
      node.status === ResourceStatus.WARNING ||
      node.status === ResourceStatus.UNKNOWN
    )
      c.problem++;
    for (const child of node.children || []) walk(child);
  };
  walk(root);
  return c;
}

function severityTone(c: SeverityCounts): Tone {
  if (c.critical > 0 || c.high > 0) return "danger";
  if (c.medium > 0) return "warning";
  return "default";
}

/** cert-manager certificate health, derived from notAfter + ready. */
function certStats(certs: KubeResource[]) {
  const now = Date.now();
  const SOON = 14 * 24 * 3600 * 1000; // 14 days
  let ready = 0;
  let expiringSoon = 0;
  let expired = 0;
  for (const c of certs) {
    const m = c.certificateMetadata;
    const t = m?.notAfter ? Date.parse(m.notAfter) : NaN;
    if ((!Number.isNaN(t) && t < now) || m?.ready === false) expired++;
    else if (!Number.isNaN(t) && t - now < SOON) expiringSoon++;
    if (m?.ready) ready++;
  }
  return { ready, expiringSoon, expired };
}

const avg = (xs: number[]): number | undefined =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

// Flux objects live in the Reconciliation section, so they're excluded from the Resources count.
const FLUX_KIND_SET = new Set<string>(FLUX_KINDS);

/** Right-rail cluster inspector: each section collapses to a number and expands to surface problems. */
const ClusterInspector: React.FC<{ onClose?: () => void }> = observer(({ onClose }) => {
  const fluxTreeStore = useInjection(FluxTreeStore);
  const metricsStore = useInjection(MetricsStore);
  const eventsStore = useInjection(EventsStore);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");

  const appsModal = useDisclosure();
  const nodesModal = useDisclosure();
  const longhornModal = useDisclosure();
  const pvModal = useDisclosure();
  const routesModal = useDisclosure();
  const servicesModal = useDisclosure();
  const certsModal = useDisclosure();
  const cveModal = useDisclosure();
  const otherModal = useDisclosure();

  // Single pass over the resource cache, bucketed by kind.
  const pods: Pod[] = [];
  const pvcs: PersistentVolumeClaim[] = [];
  const pvs: PersistentVolume[] = [];
  const certs: KubeResource[] = [];
  const ingresses: KubeResource[] = [];
  const routes: KubeResource[] = []; // IngressRoute / HTTPRoute / Gateway
  const services: KubeResource[] = [];
  const endpointSlices: KubeResource[] = [];
  const netpols: KubeResource[] = [];
  const lhVolumes: LonghornVolume[] = [];
  const lhNodes: LonghornNode[] = [];
  fluxTreeStore.resources.forEach((r) => {
    if (r instanceof LonghornVolume) lhVolumes.push(r);
    else if (r instanceof LonghornNode) lhNodes.push(r);
    else if (r instanceof Pod) pods.push(r);
    else if (r instanceof PersistentVolumeClaim) pvcs.push(r);
    else if (r instanceof PersistentVolume) pvs.push(r);
    else if (r.kind === RESOURCE_TYPE.CERTIFICATE) certs.push(r);
    else if (r.kind === RESOURCE_TYPE.INGRESS) ingresses.push(r);
    else if (
      r.kind === RESOURCE_TYPE.INGRESSROUTE ||
      r.kind === RESOURCE_TYPE.HTTPROUTE ||
      r.kind === RESOURCE_TYPE.GATEWAY
    )
      routes.push(r);
    else if (r.kind === RESOURCE_TYPE.SERVICE) services.push(r);
    else if (r.kind === RESOURCE_TYPE.ENDPOINTSLICE) endpointSlices.push(r);
    else if (r.kind === RESOURCE_TYPE.NETWORKPOLICY) netpols.push(r);
  });

  // Flux reconciliation (shared with the tree-view section).
  const recon = computeReconciliation(fluxTreeStore.root);

  // Resources (workloads). Completed pods are excluded from the denominator.
  const counts = countTree(fluxTreeStore.root, FLUX_KIND_SET);
  const podDone = (p: Pod) =>
    p.metadata?.phase === "Succeeded" || p.metadata?.phase === "Completed";
  const podsExpected = pods.filter((p) => !podDone(p));
  const podsExpectedCount = podsExpected.length;
  const podsRunning = podsExpected.filter((p) => p.metadata?.phase === "Running").length;
  // A pod still spinning up is pending, not unhealthy; only failed/warning/unknown pods are unhealthy.
  const podsBad = podsExpected.filter(
    (p) =>
      p.status === ResourceStatus.FAILED ||
      p.status === ResourceStatus.WARNING ||
      p.status === ResourceStatus.UNKNOWN,
  ).length;
  const podsPending = podsExpectedCount - podsRunning;
  const resourcesTone: Tone =
    pods.length > 0
      ? podsBad > 0
        ? "danger"
        : podsPending > 0
          ? "warning"
          : "success"
      : counts.problem > 0
        ? "danger"
        : "success";

  const nodes = fluxTreeStore.nodes;
  const notReadyNodes = nodes.filter((n) => !n.isReady).length;
  const cpuPct = metricsStore.prometheusActive
    ? avg(metricsStore.nodeUsage.map((u) => u.cpu.percent))
    : undefined;
  const memPct = metricsStore.prometheusActive
    ? avg(metricsStore.nodeUsage.map((u) => u.memory.percent))
    : undefined;
  const nodesTone: Tone =
    notReadyNodes > 0
      ? "danger"
      : (cpuPct ?? 0) >= 75 || (memPct ?? 0) >= 75
        ? "warning"
        : "success";

  // Storage — Longhorn block + generic PV/PVC block; the header reflects combined health.
  const faulted = lhVolumes.filter((v) => v.metadata?.robustness === "faulted").length;
  const degraded = lhVolumes.filter((v) => v.metadata?.robustness === "degraded").length;
  const storageUsed = sum(lhNodes.map((n) => n.metadata?.storageUsed ?? 0));
  const storageSchedulable = sum(lhNodes.map((n) => n.metadata?.storageSchedulable ?? 0));
  const storageTotal = sum(lhNodes.map((n) => n.metadata?.storageMaximum ?? 0));
  const storagePct = usagePercent(storageUsed, storageTotal);
  const boundPVCs = pvcs.filter((p) => p.metadata?.phase === "Bound").length;
  const unboundPVCs = pvcs.length - boundPVCs;
  const pvCapacity = sum(pvs.map((p) => p.metadata?.capacity ?? 0));
  const showLonghorn = lhVolumes.length > 0 || lhNodes.length > 0;
  const showGenericVolumes = pvcs.length > 0 || pvs.length > 0;
  const showStorage = showLonghorn || showGenericVolumes;
  const storageTone: Tone =
    faulted > 0
      ? "danger"
      : degraded > 0 || unboundPVCs > 0
        ? "warning"
        : "success";

  // Network — TLS + endpoints are the red-capable signals; routing is a number.
  const cert = certStats(certs);
  const readyByService = new Map<string, boolean>();
  for (const es of endpointSlices) {
    const name = es.endpointSliceMetadata?.serviceName;
    if (!name) continue;
    const key = `${es.namespace ?? ""}/${name}`;
    const ready = (es.endpointSliceMetadata?.endpoints ?? []).some((e) => e.ready);
    readyByService.set(key, (readyByService.get(key) ?? false) || ready);
  }
  const trackedServices = services.filter((s) =>
    readyByService.has(`${s.namespace ?? ""}/${s.name}`),
  );
  const brokenServices = trackedServices.filter(
    (s) => !readyByService.get(`${s.namespace ?? ""}/${s.name}`),
  );
  const routesTotal = ingresses.length + routes.length;
  const showNetwork =
    routesTotal > 0 || certs.length > 0 || trackedServices.length > 0;
  const networkTone: Tone =
    cert.expired > 0 || brokenServices.length > 0
      ? "danger"
      : cert.expiringSoon > 0
        ? "warning"
        : "success";

  const warningEvents = eventsStore.events.filter((e) => e.type === "Warning").length;
  const displayedEvents = eventsStore.events
    .filter((e) => eventFilter === "all" || e.type === eventFilter)
    .slice()
    .sort((a, b) => b.lastObserved.getTime() - a.lastObserved.getTime());
  const eventsTone: Tone = warningEvents > 0 ? "warning" : "default";

  const summary = clusterSummary(fluxTreeStore.resources.values());
  const cveCount = totalCves(summary);
  const otherCount = totalOther(summary);
  const showSecurity = cveCount > 0 || otherCount > 0;
  const securityTone: Tone =
    severityTone(summary.cve) === "danger" || severityTone(summary.other) === "danger"
      ? "danger"
      : severityTone(summary.cve) === "warning" ||
          severityTone(summary.other) === "warning"
        ? "warning"
        : "default";

  return (
    <div className="flex flex-col">
      <div className="flex items-center px-4 py-3 border-b border-default-100 sticky top-0 bg-background z-10">
        <span className="text-sm font-semibold">Cluster</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="ml-auto p-1 rounded-md text-default-400 hover:text-foreground hover:bg-content2 transition-colors lg:hidden"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {recon.apps.length > 0 && (
        <Section
          icon={<GitBranch className="w-4 h-4" />}
          title="Reconciliation"
          tone={recon.tone}
          defaultOpen
          summary={
            <Count
              value={recon.apps.length}
              label="apps"
              accent={
                recon.failed > 0 ? (
                  <Danger>{recon.failed} failed</Danger>
                ) : recon.reconciling > 0 ? (
                  <Warn>{recon.reconciling} reconciling</Warn>
                ) : null
              }
            />
          }
        >
          <HealthButton tone={recon.tone} label={recon.label} onClick={appsModal.onOpen} />
          <div className="mt-3">
            <KindBars resources={[...recon.apps, ...recon.sources]} />
          </div>
        </Section>
      )}

      <Section
        icon={<Boxes className="w-4 h-4" />}
        title="Resources"
        tone={resourcesTone}
        summary={
          pods.length > 0 ? (
            <>
              <span className="text-sm font-semibold tabular-nums">
                {podsRunning}/{podsExpectedCount}
              </span>
              <span className="text-xs text-default-400">pods</span>
              {podsBad > 0 ? (
                <Danger>{podsBad} unhealthy</Danger>
              ) : podsPending > 0 ? (
                <Warn>{podsPending} pending</Warn>
              ) : null}
            </>
          ) : (
            <Count
              value={counts.total}
              accent={counts.problem > 0 ? <Danger>{counts.problem} unhealthy</Danger> : null}
            />
          )
        }
      >
        {/* bare mode supplies the count + health button; Flux objects have their own section */}
        <ResourceCountWidget
          resource={fluxTreeStore.root}
          bare
          excludeKinds={FLUX_KIND_SET}
        />
      </Section>

      {nodes.length > 0 && (
        <Section
          icon={<Server className="w-4 h-4" />}
          title="Nodes"
          tone={nodesTone}
          summary={
            <Count
              value={nodes.length}
              label={nodes.length === 1 ? "node" : "nodes"}
              accent={
                notReadyNodes > 0 ? (
                  <Danger>{notReadyNodes} down</Danger>
                ) : cpuPct !== undefined && memPct !== undefined ? (
                  <span className="text-xs text-default-400">
                    {Math.round(cpuPct)}% · {Math.round(memPct)}%
                  </span>
                ) : null
              }
            />
          }
        >
          {cpuPct !== undefined || memPct !== undefined ? (
            <div className="flex flex-col gap-2">
              {cpuPct !== undefined && (
                <Progress
                  size="sm"
                  value={cpuPct}
                  color={usageColor(cpuPct, "primary")}
                  label="CPU"
                  showValueLabel
                  classNames={{ label: "text-xs", value: "text-xs" }}
                />
              )}
              {memPct !== undefined && (
                <Progress
                  size="sm"
                  value={memPct}
                  color={usageColor(memPct)}
                  label="Memory"
                  showValueLabel
                  classNames={{ label: "text-xs", value: "text-xs" }}
                />
              )}
            </div>
          ) : (
            <p className="text-xs text-default-400">metrics unavailable</p>
          )}
          <ViewAll onClick={nodesModal.onOpen}>
            Inspect {nodes.length} node{nodes.length === 1 ? "" : "s"}
          </ViewAll>
        </Section>
      )}

      {showStorage && (
        <Section
          icon={<HardDrive className="w-4 h-4" />}
          title="Storage"
          tone={storageTone}
          summary={
            <Count
              value={pvcs.length || lhVolumes.length}
              label={pvcs.length ? "claims" : "vols"}
              accent={
                faulted > 0 ? (
                  <Danger>{faulted} faulted</Danger>
                ) : degraded > 0 ? (
                  <Warn>{degraded} degraded</Warn>
                ) : unboundPVCs > 0 ? (
                  <Warn>{unboundPVCs} unbound</Warn>
                ) : showLonghorn ? (
                  <span className="text-xs text-default-400">
                    {Math.round(storagePct)}% used
                  </span>
                ) : null
              }
            />
          }
        >
          {showLonghorn && (
            <Block title="Longhorn" provider="distributed block storage">
              {lhNodes.length > 0 && (
                <div className="flex flex-col gap-2 mb-1">
                  <Progress
                    size="sm"
                    value={storagePct}
                    color={usageColor(storagePct)}
                    label={`${formatBytes(storageUsed)} used`}
                    showValueLabel
                    classNames={{ label: "text-xs", value: "text-xs" }}
                  />
                  <Stat label="Schedulable" value={formatBytes(storageSchedulable)} />
                  <Stat label="Total" value={formatBytes(storageTotal)} />
                </div>
              )}
              <Stat label="Volumes" value={lhVolumes.length} />
              {faulted > 0 && <Stat label="Faulted" value={faulted} tone="text-danger" />}
              {degraded > 0 && (
                <Stat label="Degraded" value={degraded} tone="text-warning" />
              )}
              <ViewAll onClick={longhornModal.onOpen}>View Longhorn volumes</ViewAll>
            </Block>
          )}

          {showGenericVolumes && (
            <Block title="Persistent Volumes" provider="Kubernetes">
              <Stat
                label="Claims (PVC)"
                value={`${boundPVCs}/${pvcs.length} bound`}
                tone={unboundPVCs > 0 ? "text-warning" : "text-foreground"}
              />
              <Stat label="Volumes (PV)" value={pvs.length} />
              {pvCapacity > 0 && (
                <Stat label="Capacity" value={formatBytes(pvCapacity)} />
              )}
              <ViewAll onClick={pvModal.onOpen}>View volumes &amp; claims</ViewAll>
            </Block>
          )}
        </Section>
      )}

      {showNetwork && (
        <Section
          icon={<Network className="w-4 h-4" />}
          title="Network"
          tone={networkTone}
          summary={
            <Count
              value={routesTotal || certs.length}
              label={routesTotal ? "routes" : "certs"}
              accent={
                brokenServices.length > 0 ? (
                  <Danger>{brokenServices.length} broken</Danger>
                ) : cert.expired > 0 ? (
                  <Danger>{cert.expired} expired</Danger>
                ) : cert.expiringSoon > 0 ? (
                  <Warn>{cert.expiringSoon} expiring</Warn>
                ) : null
              }
            />
          }
        >
          {certs.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold uppercase tracking-wide text-default-300">
                <Lock className="w-3 h-3" />
                TLS · cert-manager
              </div>
              <Stat
                label="Ready"
                value={`${cert.ready}/${certs.length}`}
                tone={cert.ready === certs.length ? "text-success" : "text-warning"}
              />
              {cert.expiringSoon > 0 && (
                <Stat label="Expiring < 14d" value={cert.expiringSoon} tone="text-warning" />
              )}
              {cert.expired > 0 && (
                <Stat label="Expired / invalid" value={cert.expired} tone="text-danger" />
              )}
              <ViewAll onClick={certsModal.onOpen}>View certificates</ViewAll>
            </div>
          )}

          {trackedServices.length > 0 && (
            <div className="mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-default-300 mb-1">
                Endpoints
              </div>
              <Stat
                label="Services with endpoints"
                value={`${trackedServices.length - brokenServices.length}/${trackedServices.length}`}
                tone={brokenServices.length === 0 ? "text-success" : "text-foreground"}
              />
              {brokenServices.length > 0 && (
                <>
                  <Stat label="No endpoints" value={brokenServices.length} tone="text-danger" />
                  <ViewAll onClick={servicesModal.onOpen}>View affected services</ViewAll>
                </>
              )}
            </div>
          )}

          {(routesTotal > 0 || netpols.length > 0) && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-default-400 pt-1 border-t border-default-100">
              {ingresses.length > 0 && <span>{ingresses.length} ingress</span>}
              {routes.length > 0 && <span>{routes.length} routes</span>}
              {netpols.length > 0 && <span>{netpols.length} policies</span>}
              {routesTotal > 0 && (
                <button
                  type="button"
                  onClick={routesModal.onOpen}
                  className="text-primary hover:underline"
                >
                  view →
                </button>
              )}
            </div>
          )}
        </Section>
      )}

      {showSecurity && (
        <Section
          icon={<ShieldAlert className="w-4 h-4" />}
          title="Security"
          tone={securityTone}
          summary={
            <Count
              value={cveCount}
              label={cveCount === 1 ? "CVE" : "CVEs"}
              accent={
                summary.cve.critical > 0 ? (
                  <Danger>{summary.cve.critical} crit</Danger>
                ) : summary.cve.high > 0 ? (
                  <span className="text-xs font-medium text-danger-400">
                    {summary.cve.high} high
                  </span>
                ) : null
              }
            />
          }
        >
          {cveCount > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-3.5 h-3.5 text-default-400" />
                <span className="text-xs font-medium">Vulnerabilities</span>
              </div>
              <SeverityRow counts={summary.cve} />
              <ViewAll onClick={cveModal.onOpen}>View vulnerabilities</ViewAll>
            </div>
          )}
          {otherCount > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileWarning className="w-3.5 h-3.5 text-default-400" />
                <span className="text-xs font-medium">Misconfigurations</span>
              </div>
              <SeverityRow counts={summary.other} />
              <ViewAll onClick={otherModal.onOpen}>View misconfigurations</ViewAll>
            </div>
          )}
        </Section>
      )}

      <Section
        icon={<Bell className="w-4 h-4" />}
        title="Events"
        tone={eventsTone}
        summary={
          <Count
            value={eventsStore.events.length}
            accent={warningEvents > 0 ? <Warn>{warningEvents} warning</Warn> : null}
          />
        }
      >
        <div className="flex flex-col max-h-[50vh] -mx-4 -mb-3">
          <EventsPanel
            events={displayedEvents}
            filter={eventFilter}
            onFilterChange={setEventFilter}
            totalEventCount={eventsStore.events.length}
            linkLabel={(event) => `${event.kind}/${event.name}`}
          />
        </div>
      </Section>

      <ResourceListModal
        isOpen={appsModal.isOpen}
        onOpenChange={appsModal.onOpenChange}
        title="Applications"
        resources={recon.apps}
      />
      <NodesModal
        isOpen={nodesModal.isOpen}
        onOpenChange={nodesModal.onOpenChange}
        nodes={nodes}
      />
      <LonghornVolumesModal
        isOpen={longhornModal.isOpen}
        onOpenChange={longhornModal.onOpenChange}
        volumes={lhVolumes}
      />
      <ResourceListModal
        isOpen={pvModal.isOpen}
        onOpenChange={pvModal.onOpenChange}
        title="Volumes & Claims"
        resources={[...pvcs, ...pvs]}
      />
      <ResourceListModal
        isOpen={routesModal.isOpen}
        onOpenChange={routesModal.onOpenChange}
        title="Routes"
        resources={[...ingresses, ...routes]}
      />
      <ResourceListModal
        isOpen={servicesModal.isOpen}
        onOpenChange={servicesModal.onOpenChange}
        title="Services without endpoints"
        resources={brokenServices}
      />
      <ResourceListModal
        isOpen={certsModal.isOpen}
        onOpenChange={certsModal.onOpenChange}
        title="Certificates"
        resources={certs}
      />
      <TrivyFindingsModal
        isOpen={cveModal.isOpen}
        onOpenChange={cveModal.onOpenChange}
        title="Vulnerabilities"
        reportUids={summary.cveReportUids}
      />
      <TrivyFindingsModal
        isOpen={otherModal.isOpen}
        onOpenChange={otherModal.onOpenChange}
        title="Misconfigurations"
        reportUids={summary.otherReportUids}
      />
    </div>
  );
});

const SeverityRow: React.FC<{ counts: SeverityCounts }> = ({ counts }) => {
  const items: { label: string; value: number; tone: string }[] = [
    { label: "Critical", value: counts.critical, tone: "text-danger" },
    { label: "High", value: counts.high, tone: "text-danger-400" },
    { label: "Medium", value: counts.medium, tone: "text-warning" },
    { label: "Low", value: counts.low, tone: "text-default-400" },
  ];
  return (
    <div className="flex justify-between w-full">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col">
          <span className={`text-sm font-bold tabular-nums ${i.tone}`}>{i.value}</span>
          <span className="text-[11px] text-default-400">{i.label}</span>
        </div>
      ))}
    </div>
  );
};

export default ClusterInspector;
