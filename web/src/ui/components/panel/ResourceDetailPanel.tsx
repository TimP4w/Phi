import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { Alert, Chip, Tabs, Tooltip, useOverlayState } from "@heroui/react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  GitCommitHorizontal,
  HardDrive,
  X,
} from "lucide-react";

import {
  Container,
  Deployment,
  FluxResource,
  HelmRelease,
  KubeResource,
  Kustomization,
  Pod,
  ResourceStatus,
} from "../../../core/fluxTree/models/tree";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { EventsStore } from "../../../core/fluxTree/stores/events.store";
import { MetricsStore } from "../../../core/metrics/stores/metrics.store";
import { DescribeNodeUseCase } from "../../../core/resource/usecases/describeNode.usecase";
import { WatchLogsUseCase } from "../../../core/resource/usecases/watchLogs.usecase";
import { WatchMetricsUseCase } from "../../../core/metrics/usecases/watchMetrics.usecase";
import { StopWatchMetricsUseCase } from "../../../core/metrics/usecases/stopWatchMetrics.usecase";
import { TYPES } from "../../../core/shared/types";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { METRICS_DEFAULT_RANGE } from "../../../core/metrics/constants/metrics.const";
import {
  SeverityCounts,
  TrivySummary,
  emptyTrivySummary,
  hasFindings,
  severityColor,
  summaryWorstSeverity,
  totalCves,
  totalOther,
} from "../../../core/trivy/trivy";
import { formatBytes, gitCommitUrl, shortRevision } from "../../shared/format";
import { collectVolumes, volumeSize } from "../../shared/volumes";
import { ROUTES } from "../../routes/routes.enum";

import StatusChip from "../status-chip/StatusChip";
import EventsPanel, { EventFilter } from "../events/EventsPanel";
import { ContainerRow, InfoTab, StorageRollup } from "./InfoTab";
import { containerStateColor } from "./containerStatus";
import { conditionDotClass, statusDotClass } from "../../shared/helpers";
import { DescribeTab } from "./DescribeTab";
import { LogsTab } from "./LogsTab";
import MetricsTab from "./MetricsTab";
import TrivyFindingsModal from "../widgets/TrivyFindingsModal";
import ResourceCountWidget from "../widgets/ResourcesCountWidget";
import ReconciliationSection from "../summary/Reconciliation";

type ResourceDetailPanelProps = {
  node?: KubeResource;
  // Mobile-only close handler (the panel is a full-screen overlay on mobile).
  onClose?: () => void;
};

/** Small close button shown only on mobile, where the panel is full-screen. */
const MobileClose = ({ onClose }: { onClose?: () => void }) =>
  onClose ? (
    <div className="md:hidden flex items-center justify-end px-2 py-1.5 border-b border-border flex-shrink-0">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close details"
        className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  ) : null;

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2 px-2">
    {children}
  </p>
);

const EmptyState = ({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) => (
  <div className="flex flex-col items-center justify-center h-full gap-2 text-muted">
    <Icon className="w-8 h-8 opacity-30" />
    <span className="text-sm">{label}</span>
  </div>
);

type Severity = "danger" | "warning" | null;

const worstStatusSeverity = (statuses: ResourceStatus[]): Severity => {
  let warn = false;
  for (const s of statuses) {
    if (s === ResourceStatus.FAILED) return "danger";
    if (s === ResourceStatus.WARNING || s === ResourceStatus.PENDING)
      warn = true;
  }
  return warn ? "warning" : null;
};

const worstContainerSeverity = (containers: Container[]): Severity => {
  let warn = false;
  for (const c of containers) {
    const color = containerStateColor(c);
    if (color === "danger") return "danger";
    if (color === "warning") warn = true;
  }
  return warn ? "warning" : null;
};

const TabTitle = ({
  label,
  severity,
  badge,
}: {
  label: string;
  severity?: Severity;
  badge?: React.ReactNode;
}) => (
  <div className="flex items-center gap-1.5">
    {label}
    {badge}
    {severity === "danger" && (
      <AlertCircle className="w-3.5 h-3.5 text-danger" />
    )}
    {severity === "warning" && (
      <AlertTriangle className="w-3.5 h-3.5 text-warning" />
    )}
  </div>
);

// Maps Trivy severity color keys onto the tab status-hint severities.
const trivyTabSeverity = (summary: TrivySummary): Severity => {
  const c = severityColor(summaryWorstSeverity(summary));
  return c === "danger" ? "danger" : c === "warning" ? "warning" : null;
};

// Horizontal "managed by" lineage: source-most ancestor ▸ … ▸ this resource.
const Lineage = ({
  chain,
  node,
}: {
  chain: KubeResource[];
  node: KubeResource;
}) => (
  <div className="flex items-center gap-1.5 flex-wrap">
    {chain.map((res) => (
      <span key={res.uid} className="flex items-center gap-1.5">
        <Link
          to={`${ROUTES.RESOURCE}/${res.uid}`}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-secondary transition-colors max-w-[160px]"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClass(res.status)}`}
          />
          <span className="text-xs truncate">{res.name}</span>
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted flex-shrink-0" />
      </span>
    ))}
    <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-secondary border border-border max-w-[180px]">
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClass(node.status)}`}
      />
      <span className="text-xs font-semibold truncate">{node.name}</span>
    </span>
  </div>
);

const DependsOnPills = ({ deps }: { deps: Kustomization[] }) => (
  <div className="flex flex-wrap gap-1.5">
    {deps.map((dep) => (
      <Link key={dep.uid} to={`${ROUTES.RESOURCE}/${dep.uid}`}>
        <Chip size="sm" variant="soft" className="cursor-pointer">
          <span className="flex items-center gap-1">
            <span
              className={`w-1.5 h-1.5 rounded-full ${statusDotClass(dep.status)}`}
            />
            {dep.name}
          </span>
        </Chip>
      </Link>
    ))}
  </div>
);

type Pill = {
  label: string;
  value: React.ReactNode;
  href?: string;
  /** Treat href as an external URL (new tab) rather than an in-app route. */
  external?: boolean;
  /** Full detail shown on hover. */
  tooltip?: React.ReactNode;
  tone?: "default" | "warning";
  mono?: boolean;
};

const InfoPill = ({
  label,
  value,
  href,
  external,
  tooltip,
  tone,
  mono,
}: Pill) => {
  const body = (
    <>
      <span className="text-muted flex-shrink-0">{label}</span>
      <span
        className={`truncate max-w-[220px] ${mono ? "font-mono" : ""} ${
          tone === "warning" ? "text-warning" : ""
        }`}
      >
        {value}
      </span>
    </>
  );
  const cls =
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-surface text-xs max-w-full";
  const el =
    href && external ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`${cls} hover:bg-surface-secondary transition-colors`}
      >
        {body}
      </a>
    ) : href ? (
      <Link to={href} className={`${cls} hover:bg-surface-secondary transition-colors`}>
        {body}
      </Link>
    ) : (
      <div className={cls}>{body}</div>
    );
  return tooltip ? (
    <Tooltip>
      <Tooltip.Trigger>{el}</Tooltip.Trigger>
      <Tooltip.Content>{tooltip}</Tooltip.Content>
    </Tooltip>
  ) : (
    el
  );
};

// Kind-specific quick facts, surfaced as pills above the detailed info.
const kindPills = (node: KubeResource, store: FluxTreeStore): Pill[] => {
  const pills: Pill[] = [];
  const repoHref = (name?: string, kind?: string) => {
    const repo = store.findRepositoryByNameAndKind(name, kind);
    return repo ? `${ROUTES.RESOURCE}/${repo.uid}` : undefined;
  };

  if (node instanceof Kustomization) {
    const m = node.metadata;
    if (m?.sourceRef)
      pills.push({
        label: "Source",
        value: `${m.sourceRef.name} (${m.sourceRef.kind})`,
        href: repoHref(m.sourceRef.name, m.sourceRef.kind),
        mono: true,
      });
    if (m?.path) pills.push({ label: "Path", value: m.path, mono: true });
    if (m?.lastAppliedRevision) {
      const repoUrl = m.sourceRef
        ? store.findRepositoryByRef(m.sourceRef)?.getURL()
        : undefined;
      const sha = m.lastAppliedRevision.slice(
        m.lastAppliedRevision.indexOf(":") + 1,
      );
      pills.push({
        label: "Revision",
        value: (
          <span className="inline-flex items-center gap-1">
            <GitCommitHorizontal className="w-3 h-3 flex-shrink-0" />
            {shortRevision(m.lastAppliedRevision)}
          </span>
        ),
        mono: true,
        href: repoUrl && sha ? gitCommitUrl(repoUrl, sha) : undefined,
        external: true,
      });
    }
  } else if (node instanceof HelmRelease) {
    const m = node.metadata;
    if (m?.chartName)
      pills.push({ label: "Chart", value: m.chartName, mono: true });
    if (m?.chartVersion)
      pills.push({ label: "Version", value: m.chartVersion, mono: true });
    if (m?.sourceRef)
      pills.push({
        label: "Source",
        value: `${m.sourceRef.name} (${m.sourceRef.kind})`,
        href: repoHref(m.sourceRef.name, m.sourceRef.kind),
        mono: true,
      });
  } else if (node instanceof Deployment) {
    const m = node.metadata;
    if (m) {
      pills.push({
        label: "Ready",
        value: `${m.readyReplicas ?? 0}/${m.replicas ?? 0}`,
      });
      if (m.availableReplicas != null)
        pills.push({ label: "Available", value: String(m.availableReplicas) });
    }
  } else if (node instanceof Pod) {
    if (node.metadata?.phase)
      pills.push({ label: "Phase", value: String(node.metadata.phase) });
  }

  if (node instanceof FluxResource) {
    if (node.lastHandledReconcileAt)
      pills.push({
        label: "Last reconcile",
        value: formatDistanceToNowStrict(node.lastHandledReconcileAt, {
          addSuffix: true,
        }),
        tooltip: format(node.lastHandledReconcileAt, "yyyy-MM-dd HH:mm:ss"),
      });
    if (node.lastSyncAt)
      pills.push({
        label: "Last sync",
        value: formatDistanceToNowStrict(node.lastSyncAt, { addSuffix: true }),
        tooltip: format(node.lastSyncAt, "yyyy-MM-dd HH:mm:ss"),
      });
    if (node.isReconciling)
      pills.push({ label: "Reconciling", value: "yes", tone: "warning" });
    if (node.isSuspended)
      pills.push({ label: "Suspended", value: "yes", tone: "warning" });
  }

  return pills;
};

const ConditionsSection = ({ resource }: { resource: KubeResource }) => {
  if (resource.conditions.length === 0) return null;
  return (
    <div className="space-y-2">
      <SectionTitle>Conditions</SectionTitle>
      <div className="space-y-1">
        {resource.conditions.map((c) => (
          <Tooltip key={c.type}>
            <Tooltip.Trigger>
              <div className="flex items-center justify-between gap-2 px-1 py-0.5 rounded hover:bg-surface">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${conditionDotClass(c)}`}
                  />
                  <span className="text-xs text-muted truncate">
                    {c.type}
                  </span>
                </div>
                <span className="text-xs text-muted truncate max-w-[150px] text-right">
                  {c.reason}
                </span>
              </div>
            </Tooltip.Trigger>
            <Tooltip.Content>{c.message}</Tooltip.Content>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};

const severityStats = (c: SeverityCounts) => [
  {
    label: "Critical",
    value: c.critical,
    color: "text-danger",
    severity: "CRITICAL",
  },
  { label: "High", value: c.high, color: "text-danger", severity: "HIGH" },
  {
    label: "Medium",
    value: c.medium,
    color: "text-warning",
    severity: "MEDIUM",
  },
  { label: "Low", value: c.low, color: "text-muted", severity: "LOW" },
];

const SeverityBreakdown = ({
  counts,
  onOpen,
}: {
  counts: SeverityCounts;
  onOpen: (severity?: string) => void;
}) => (
  <div className="flex justify-between px-2">
    {severityStats(counts).map((s) => (
      <button
        key={s.label}
        type="button"
        onClick={() => onOpen(s.severity)}
        className="flex flex-col items-center hover:opacity-80 transition-opacity"
      >
        <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
        <span className="text-[11px] text-muted">{s.label}</span>
      </button>
    ))}
  </div>
);

const SecurityPanel = ({ summary }: { summary: TrivySummary }) => {
  const cveModal = useOverlayState();
  const otherModal = useOverlayState();
  const [cveSeverity, setCveSeverity] = useState<string | undefined>();
  const [otherSeverity, setOtherSeverity] = useState<string | undefined>();

  const openCve = (s?: string) => {
    setCveSeverity(s);
    cveModal.open();
  };
  const openOther = (s?: string) => {
    setOtherSeverity(s);
    otherModal.open();
  };

  return (
    <div className="p-4 space-y-6">
      {totalCves(summary) > 0 && (
        <div className="space-y-2">
          <SectionTitle>Vulnerabilities</SectionTitle>
          <SeverityBreakdown counts={summary.cve} onOpen={openCve} />
        </div>
      )}
      {totalOther(summary) > 0 && (
        <div className="space-y-2">
          <SectionTitle>Misconfigurations</SectionTitle>
          <SeverityBreakdown counts={summary.other} onOpen={openOther} />
        </div>
      )}
      <TrivyFindingsModal
        isOpen={cveModal.isOpen}
        onOpenChange={cveModal.setOpen}
        title="Vulnerabilities"
        reportUids={summary.cveReportUids}
        initialSeverity={cveSeverity}
      />
      <TrivyFindingsModal
        isOpen={otherModal.isOpen}
        onOpenChange={otherModal.setOpen}
        title="Misconfigurations"
        reportUids={summary.otherReportUids}
        initialSeverity={otherSeverity}
      />
    </div>
  );
};

const ResourceDetailPanel = observer(function ResourceDetailPanel({
  node,
  onClose,
}: ResourceDetailPanelProps) {
  const fluxTreeStore = useInjection(FluxTreeStore);
  const eventsStore = useInjection(EventsStore);
  const metricsStore = useInjection(MetricsStore);
  const describeNodeUseCase = useInjection<DescribeNodeUseCase>(
    TYPES.DescribeNodeUseCase,
  );
  const watchLogsUseCase = useInjection<WatchLogsUseCase>(
    TYPES.WatchLogsUseCase,
  );
  const watchMetrics = useInjection<WatchMetricsUseCase>(
    TYPES.WatchMetricsUseCase,
  );
  const stopWatchMetrics = useInjection<StopWatchMetricsUseCase>(
    TYPES.StopWatchMetricsUseCase,
  );

  const [activeTab, setActiveTab] = useState<string>("main");
  const [describe, setDescribe] = useState("");
  const [describeLoading, setDescribeLoading] = useState(false);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [metricsRange, setMetricsRange] = useState<string>(
    METRICS_DEFAULT_RANGE,
  );

  const uid = node?.uid;
  const isPod = node?.kind === RESOURCE_TYPE.POD;
  const metricsEligible = !!node && node.hasMetrics;
  const showMetrics = metricsEligible && metricsStore.prometheusActive;

  useEffect(() => {
    setActiveTab("main");
    setEventFilter("all");
  }, [uid]);

  useEffect(() => {
    if (!node) return;
    setDescribeLoading(true);
    setDescribe("");
    describeNodeUseCase
      .execute(node.uid)
      .then(setDescribe)
      .finally(() => setDescribeLoading(false));
  }, [node, describeNodeUseCase]);

  useEffect(() => {
    if (node && isPod) {
      fluxTreeStore.setSelectedResource(node);
      watchLogsUseCase.execute(node);
    }
  }, [node, isPod, fluxTreeStore, watchLogsUseCase]);

  useEffect(() => {
    if (node && metricsEligible) {
      watchMetrics.execute({
        channel: "detail",
        uid: node.uid,
        range: metricsRange,
      });
      return () => stopWatchMetrics.execute("detail");
    }
  }, [node, metricsEligible, watchMetrics, stopWatchMetrics, metricsRange]);

  const sortedEvents = node ? eventsStore.sortedEventsForResource(node.uid) : [];
  const eventCount = sortedEvents.length;
  const warningCount = node ? eventsStore.warningCountForResource(node.uid) : 0;
  const displayedEvents = sortedEvents.filter(
    (e) => eventFilter === "all" || e.type === eventFilter,
  );

  const volumes = useMemo(
    () => (node ? collectVolumes(node) : []),
    // Recompute when the tree rebuilds so subtree volumes stay current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node, fluxTreeStore.tree],
  );

  if (!node) {
    return (
      <div className="h-full flex flex-col">
        <MobileClose onClose={onClose} />
        <div className="flex-1 flex items-center justify-center text-sm text-muted px-6 text-center">
          Select a resource to see its details.
        </div>
      </div>
    );
  }

  const containers =
    node instanceof Pod ? (node.metadata?.containers ?? []) : [];
  const containerSeverity = worstContainerSeverity(containers);
  const volumeSeverity = worstStatusSeverity(volumes.map((v) => v.status));

  const trivySummary = fluxTreeStore.trivySubtreeIndex.get(node.uid) ?? emptyTrivySummary();
  const chain = fluxTreeStore.findFluxParents(node.uid);
  const dependsOn =
    node instanceof Kustomization
      ? (node.metadata?.dependsOn ?? [])
          .map((name) => fluxTreeStore.findKustomizationByName(name))
          .filter((d): d is Kustomization => !!d)
      : [];

  const failingCondition =
    node.status === ResourceStatus.FAILED ||
    node.status === ResourceStatus.WARNING
      ? node.conditions.find((c) => !c.status)
      : undefined;

  const applied =
    node instanceof Kustomization
      ? node.metadata?.lastAppliedRevision
      : undefined;
  const attempted =
    node instanceof Kustomization
      ? node.metadata?.lastAttemptedRevision
      : undefined;
  const drift = !!applied && !!attempted && applied !== attempted;
  const pills = kindPills(node, fluxTreeStore);

  return (
    <div className="flex flex-col h-full">
      <MobileClose onClose={onClose} />
      <Tabs
        aria-label="Resource detail"
        variant="secondary"
        selectedKey={activeTab}
        onSelectionChange={(k) => setActiveTab(String(k))}
        className="flex flex-col min-h-0 flex-1"
      >
        {/* w-full + min-w-0 caps the strip to the panel width so it scrolls; scrollbar-default re-shows the bar. ListContainer is required for the secondary (underline) variant styles to apply. */}
        <Tabs.ListContainer className="px-4 pt-1 flex-shrink-0 w-full min-w-0">
        <Tabs.List className="w-full min-w-0 scrollbar-default">
          <Tabs.Tab id="main">Main</Tabs.Tab>
          {hasFindings(trivySummary) ? (
            <Tabs.Tab id="security">
              <TabTitle
                label="Security"
                severity={trivyTabSeverity(trivySummary)}
                badge={
                  <Chip size="sm" variant="soft" className="h-4 text-xs">
                    {totalCves(trivySummary)}
                  </Chip>
                }
              />
            </Tabs.Tab>
          ) : null}
          {node instanceof Pod && containers.length > 0 ? (
            <Tabs.Tab id="containers">
              <TabTitle label="Containers" severity={containerSeverity} />
            </Tabs.Tab>
          ) : null}
          <Tabs.Tab id="events">
            <TabTitle
              label="Events"
              badge={
                eventCount > 0 ? (
                  <Chip
                    size="sm"
                    color={warningCount > 0 ? "warning" : "default"}
                    variant="soft"
                    className="h-4 text-xs"
                  >
                    {eventCount}
                  </Chip>
                ) : undefined
              }
            />
          </Tabs.Tab>
          <Tabs.Tab id="volumes">
            <TabTitle label="Volumes" severity={volumeSeverity} />
          </Tabs.Tab>
          {showMetrics ? <Tabs.Tab id="metrics">Metrics</Tabs.Tab> : null}
          <Tabs.Tab id="describe">Describe</Tabs.Tab>
          {isPod ? <Tabs.Tab id="logs">Logs</Tabs.Tab> : null}
        </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel
          id="main"
          className="flex-1 overflow-y-auto min-h-0 p-0"
        >
          <div className="p-4 space-y-5">
            {failingCondition?.message && (
              <Alert
                status={
                  node.status === ResourceStatus.FAILED ? "danger" : "warning"
                }
              >
                <Alert.Title>
                  {failingCondition.reason || "Not ready"}
                </Alert.Title>
                <Alert.Description>
                  {failingCondition.message}
                </Alert.Description>
              </Alert>
            )}

            {drift && (
              <Alert status="warning">
                <Alert.Title>Revision drift</Alert.Title>
                <Alert.Description>
                  {`Applied ${shortRevision(applied!)} differs from attempted ${shortRevision(attempted!)}`}
                </Alert.Description>
              </Alert>
            )}

            {/* Top-down: what's above (parents), this resource, then below. */}
            {(chain.length > 0 || node instanceof Kustomization) && (
              <div className="space-y-3">
                <SectionTitle>Relationships</SectionTitle>
                {chain.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted px-1">Managed by</p>
                    <Lineage chain={chain} node={node} />
                  </div>
                )}
                {node instanceof Kustomization && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted px-1">Depends on</p>
                    {dependsOn.length === 0 ? (
                      <p className="text-xs text-muted px-1">
                        No dependencies
                      </p>
                    ) : (
                      <DependsOnPills deps={dependsOn} />
                    )}
                  </div>
                )}
              </div>
            )}

            <ConditionsSection resource={node} />

            {pills.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pills.map((p) => (
                  <InfoPill key={p.label} {...p} />
                ))}
              </div>
            )}

            <ReconciliationSection root={node} />

            <ResourceCountWidget
              resource={node}
              skipGrandChildren
              bare
              title="Subresources"
            />

            <InfoTab resource={node} hideStorage />
          </div>
        </Tabs.Panel>

        {hasFindings(trivySummary) ? (
          <Tabs.Panel
            id="security"
            className="flex-1 overflow-y-auto min-h-0 p-0"
          >
            <SecurityPanel summary={trivySummary} />
          </Tabs.Panel>
        ) : null}

        {node instanceof Pod && containers.length > 0 ? (
          <Tabs.Panel
            id="containers"
            className="flex-1 overflow-y-auto min-h-0 p-0"
          >
            <div className="p-4 space-y-0.5">
              {containers.map((c) => (
                <ContainerRow
                  key={`${c.isInit ? "init/" : ""}${c.name}`}
                  container={c}
                />
              ))}
            </div>
          </Tabs.Panel>
        ) : null}

        <Tabs.Panel
          id="events"
          className="flex-1 overflow-y-auto min-h-0 p-0"
        >
          <div className="flex flex-col h-full">
            <EventsPanel
              events={displayedEvents}
              filter={eventFilter}
              onFilterChange={setEventFilter}
              totalEventCount={eventCount}
              showCount
            />
          </div>
        </Tabs.Panel>

        <Tabs.Panel
          id="volumes"
          className="flex-1 overflow-y-auto min-h-0 p-0"
        >
          {volumes.length === 0 ? (
            <EmptyState icon={HardDrive} label="No volumes" />
          ) : (
            <div className="p-4 space-y-6">
              <StorageRollup resource={node} />
              <div>
                <SectionTitle>Volumes ({volumes.length})</SectionTitle>
                <div className="space-y-0.5">
                  {volumes.map((v) => (
                    <Link
                      key={v.uid}
                      to={`${ROUTES.RESOURCE}/${v.uid}`}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-secondary"
                    >
                      <HardDrive className="w-4 h-4 text-muted flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">
                          {v.name}
                        </p>
                        <p className="text-xs text-muted">{v.kind}</p>
                      </div>
                      {volumeSize(v) > 0 && (
                        <span className="text-xs font-mono text-muted flex-shrink-0">
                          {formatBytes(volumeSize(v))}
                        </span>
                      )}
                      <StatusChip resource={v} />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Tabs.Panel>

        {showMetrics ? (
          <Tabs.Panel
            id="metrics"
            className="flex-1 overflow-y-auto min-h-0 p-0"
          >
            <div className="p-4">
              <MetricsTab
                uid={node.uid}
                range={metricsRange}
                onRangeChange={setMetricsRange}
              />
            </div>
          </Tabs.Panel>
        ) : null}

        <Tabs.Panel
          id="describe"
          className="flex-1 overflow-y-auto min-h-0 p-0"
        >
          <DescribeTab describe={describe} isLoading={describeLoading} />
        </Tabs.Panel>

        {isPod ? (
          <Tabs.Panel id="logs" className="flex-1 overflow-y-auto min-h-0 p-0">
            <LogsTab />
          </Tabs.Panel>
        ) : null}
      </Tabs>
    </div>
  );
});

export default ResourceDetailPanel;
