import "reflect-metadata";
import "@xyflow/react/dist/style.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import {
  useParams,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import {
  FluxResource,
  KubeResource,
  ResourceStatus,
} from "../../../core/fluxTree/models/tree";
import { Button } from "@heroui/react";
import AppLogo from "../../components/resource-icon/ResourceIcon";
import ResourceBreadcrumbs from "../../components/layout/ResourceBreadcrumbs";
import ResourceDetailPanel from "../../components/panel/ResourceDetailPanel";
import Header from "../../components/layout/Header";
import {
  GRAPH_SUBPATH,
  NETWORK_SUBPATH,
  TREE_SUBPATH,
  ROUTES,
} from "../../routes/routes.enum";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import RenderTreeNode from "../../components/resource-tree/ResourceTree";
import NetworkGraph from "../../components/network/NetworkGraph";
import { ReactFlowProvider } from "@xyflow/react";
import {
  COLOR_HEALTHY,
  COLOR_UNHEALTHY,
} from "../../../core/network/usecases/NetworkTopology.usecase";
import { ResourceFilter } from "../../shared/resourceFilter";
import { statusDotClass } from "../../shared/helpers";
import ReconcileSuspendButtonGroup from "../../components/play-pause/ReconcileSuspendButtonGroup";
import {
  Check,
  ChevronDown,
  List,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Workflow,
  X,
} from "lucide-react";
import StatusChip from "../../components/status-chip/StatusChip";
import ConnectedGraph from "../../components/connected-graph/ConnectedGraph";
import { TYPES } from "../../../core/shared/types";
import { WatchMetricsUseCase } from "../../../core/metrics/usecases/watchMetrics.usecase";
import { StopWatchMetricsUseCase } from "../../../core/metrics/usecases/stopWatchMetrics.usecase";

type ResourceViewMode = "graph" | "tree" | "network";

const VIEW_BY_SUBPATH: Record<string, ResourceViewMode> = {
  [GRAPH_SUBPATH]: "graph",
  [TREE_SUBPATH]: "tree",
  [NETWORK_SUBPATH]: "network",
};

// Filters live in the URL query string so they're shareable and survive a reload,
// e.g. ?filterKind=Pod,Kustomization&filterStatus=warning.
const FILTER_KIND_PARAM = "filterKind";
const FILTER_STATUS_PARAM = "filterStatus";

const STATUS_VALUES = new Set<string>(Object.values(ResourceStatus));

function parseStatusParam(raw: string | null): ResourceStatus[] {
  if (!raw) return [];
  return raw.split(",").filter((s) => STATUS_VALUES.has(s)) as ResourceStatus[];
}

function parseKindParam(raw: string | null): string[] {
  return raw ? raw.split(",").filter(Boolean) : [];
}

const NETWORK_LEGEND: { color: string; label: string; dash: boolean }[] = [
  { color: COLOR_HEALTHY, label: "Routable", dash: false },
  { color: COLOR_UNHEALTHY, label: "Pending / not ready", dash: true },
];

const FLUX_APP_KINDS: string[] = [
  RESOURCE_TYPE.KUSTOMIZATION,
  RESOURCE_TYPE.HELM_RELEASE,
  RESOURCE_TYPE.HELM_REPOSITORY,
  RESOURCE_TYPE.HELM_CHART,
];

function hasFluxAppGrandchildren(resource: KubeResource): boolean {
  for (const child of resource.children) {
    for (const grandchild of child.children) {
      if (FLUX_APP_KINDS.includes(grandchild.kind)) return true;
    }
  }
  return false;
}

const STATUS_FILTER_OPTIONS: { value: ResourceStatus; label: string }[] = [
  { value: ResourceStatus.FAILED, label: "Failed" },
  { value: ResourceStatus.WARNING, label: "Warning" },
  { value: ResourceStatus.PENDING, label: "Pending" },
  { value: ResourceStatus.SUCCESS, label: "Ready" },
];

type KindFilterSelectProps = {
  availableKinds: string[];
  selectedKinds: string[];
  onChange: (kinds: string[]) => void;
};

function KindFilterSelect({
  availableKinds,
  selectedKinds,
  onChange,
}: KindFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(
    () =>
      availableKinds.filter((k) =>
        k.toLowerCase().includes(search.toLowerCase()),
      ),
    [availableKinds, search],
  );

  const toggle = (kind: string) =>
    onChange(
      selectedKinds.includes(kind)
        ? selectedKinds.filter((k) => k !== kind)
        : [...selectedKinds, kind],
    );

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
          selectedKinds.length > 0
            ? "bg-surface-tertiary text-foreground"
            : "text-muted hover:text-foreground hover:bg-surface-secondary"
        }`}
      >
        {selectedKinds.length > 0 ? `${selectedKinds.length} types` : "Type"}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-52 bg-surface border border-border rounded-lg shadow-xl">
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border">
            <input
              autoFocus
              type="text"
              placeholder="Search types…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-muted hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted px-2 py-2">No matches</p>
            ) : (
              filtered.map((kind) => {
                const selected = selectedKinds.includes(kind);
                return (
                  <button
                    key={kind}
                    onClick={() => toggle(kind)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-secondary text-xs text-left transition-colors"
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
                        selected ? "bg-accent border-accent" : "border-segment"
                      }`}
                    >
                      {selected && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    {kind}
                  </button>
                );
              })
            )}
          </div>

          {selectedKinds.length > 0 && (
            <div className="border-t border-border p-1">
              <button
                onClick={() => {
                  onChange([]);
                  setOpen(false);
                  setSearch("");
                }}
                className="w-full text-left text-xs text-muted hover:text-foreground px-2 py-1.5 rounded-md hover:bg-surface-secondary transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const VIEW_OPTIONS: {
  mode: ResourceViewMode;
  label: string;
  Icon: typeof Network;
}[] = [
  { mode: "graph", label: "Graph", Icon: Network },
  { mode: "tree", label: "Tree", Icon: List },
  { mode: "network", label: "Network", Icon: Workflow },
];

function ViewModeSwitcher({
  activeView,
  onSelect,
}: {
  activeView: ResourceViewMode;
  onSelect: (mode: ResourceViewMode) => void;
}) {
  return (
    <>
      {VIEW_OPTIONS.map(({ mode, label, Icon }) => (
        <Button
          key={mode}
          size="sm"
          variant={activeView === mode ? "secondary" : "ghost"}
          className="rounded-md"
          onPress={() => onSelect(mode)}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </Button>
      ))}
    </>
  );
}

const ResourceView: React.FC = observer(() => {
  const { nodeUid, view } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView: ResourceViewMode = VIEW_BY_SUBPATH[view ?? ""] ?? "graph";
  // Open by default on desktop; closed on mobile, where it's a full-screen overlay.
  const [sidebarOpen, setSidebarOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches,
  );
  const fluxTreeStore = useInjection(FluxTreeStore);

  const resource = fluxTreeStore.findResourceByUid(nodeUid ?? "");

  // Switch sub-view, reflecting it in the URL segment (graph is the default, no segment)
  // while preserving the active filter query string.
  const selectView = (next: ResourceViewMode) => {
    if (!resource) return;
    const base = `${ROUTES.RESOURCE}/${resource.uid}`;
    const target = next === "graph" ? base : `${base}/${next}`;
    navigate({ pathname: target, search: location.search });
  };

  const watchMetrics = useInjection<WatchMetricsUseCase>(
    TYPES.WatchMetricsUseCase,
  );
  const stopWatchMetrics = useInjection<StopWatchMetricsUseCase>(
    TYPES.StopWatchMetricsUseCase,
  );

  // Whitelisted UIDs in the visible subtree; joined string keeps the effect dependency stable.
  const metricsUids = useMemo(
    () => fluxTreeStore.metricsUidsInSubtree(resource?.uid).join(","),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resource?.uid, fluxTreeStore.tree],
  );

  useEffect(() => {
    if (!metricsUids) return;
    watchMetrics.execute({ channel: "tree", uids: metricsUids.split(",") });
    return () => stopWatchMetrics.execute("tree");
  }, [metricsUids, watchMetrics, stopWatchMetrics]);

  // The docked detail panel follows the selected node, resetting to the root resource on navigation.
  const [selectedNode, setSelectedNode] = useState<KubeResource | undefined>(
    undefined,
  );
  useEffect(() => {
    setSelectedNode(resource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource?.uid]);

  // On navigation, default the kind filter to the flux app layer when the subtree is
  // large (apps nested as grandchildren); otherwise start unfiltered. Decided once per
  // node — and only once its subtree is populated — so a tree rebuild never clobbers a
  // user's manual change, but a slow initial load still gets the default applied. A
  // filter already in the URL (shared link / reload) takes precedence and is left alone.
  const autoFilteredUid = useRef<string | null>(null);
  useEffect(() => {
    const uid = resource?.uid;
    if (!uid || !fluxTreeStore.loaded || autoFilteredUid.current === uid)
      return;
    autoFilteredUid.current = uid;
    if (
      searchParams.has(FILTER_KIND_PARAM) ||
      searchParams.has(FILTER_STATUS_PARAM)
    )
      return;
    if (hasFluxAppGrandchildren(resource)) setKindFilters(FLUX_APP_KINDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, fluxTreeStore.loaded, fluxTreeStore.tree]);

  const fullChain = useMemo(
    () => fluxTreeStore.findFluxParents(resource?.uid),
    [fluxTreeStore, resource],
  );

  const availableKinds = useMemo(
    () => fluxTreeStore.kindsInSubtree(resource?.uid),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resource?.uid, fluxTreeStore.tree],
  );

  const statusFilters = useMemo(
    () => parseStatusParam(searchParams.get(FILTER_STATUS_PARAM)),
    [searchParams],
  );
  const kindFilters = useMemo(
    () => parseKindParam(searchParams.get(FILTER_KIND_PARAM)),
    [searchParams],
  );

  const updateFilterParam = (key: string, values: string[]) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (values.length) next.set(key, values.join(","));
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const setKindFilters = (kinds: string[]) =>
    updateFilterParam(FILTER_KIND_PARAM, kinds);

  const activeFilter: ResourceFilter = useMemo(
    () => ({ statuses: statusFilters, kinds: kindFilters }),
    [statusFilters, kindFilters],
  );

  const hasActiveFilter = statusFilters.length > 0 || kindFilters.length > 0;

  const toggleStatus = (s: ResourceStatus) =>
    updateFilterParam(
      FILTER_STATUS_PARAM,
      statusFilters.includes(s)
        ? statusFilters.filter((x) => x !== s)
        : [...statusFilters, s],
    );

  const clearFilters = () =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(FILTER_KIND_PARAM);
        next.delete(FILTER_STATUS_PARAM);
        return next;
      },
      { replace: true },
    );

  const selectNode = (node: KubeResource | undefined) => setSelectedNode(node);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header>
        {resource instanceof FluxResource && resource.isReconcilable && (
          <ReconcileSuspendButtonGroup resource={resource} compact />
        )}
      </Header>

      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-shrink-0 px-6 py-2.5 border-b border-border flex flex-col items-start gap-2 md:flex-row md:items-end md:gap-4">
          <ResourceBreadcrumbs
            items={[
              { key: "cluster", label: "Cluster", onPress: () => navigate("/") },
              ...fullChain.map((res) => ({
                key: res.uid,
                label: res.name,
                onPress: () => navigate(`/resource/${res.uid}`),
              })),
              { key: resource?.uid ?? "current", label: resource?.name ?? "" },
            ]}
          />

          <div className="md:ml-auto flex items-center gap-3 min-w-0 max-w-full">
            <StatusChip resource={resource} />
            <AppLogo groupKind={resource?.groupKind} />
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight truncate">
                {resource?.name}
              </h1>
              <span className="text-muted text-xs">
                {resource?.kind} · {resource?.namespace}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile view switcher — separate static row avoids overlap with the floating filter bar. */}
        <div className="md:hidden flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
          <div className="flex items-center gap-1 bg-surface rounded-lg p-1 border border-border">
            <ViewModeSwitcher activeView={activeView} onSelect={selectView} />
          </div>
          <button
            className={`ml-auto flex items-center justify-center w-8 h-8 rounded-lg border transition-colors flex-shrink-0 ${
              sidebarOpen
                ? "border-border bg-surface-secondary text-foreground"
                : "border-border bg-surface hover:bg-surface-secondary text-muted hover:text-foreground"
            }`}
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? "Close details panel" : "Open details panel"}
          >
            {sidebarOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          <div className="flex-1 min-w-0 min-h-0 relative">
            {/* Floating view controls — desktop only (mobile uses the row above) */}
            <div className="hidden md:flex absolute top-3 right-4 z-10 items-center gap-1 bg-surface/90 backdrop-blur-sm rounded-lg p-1 border border-border shadow-sm">
              <ViewModeSwitcher activeView={activeView} onSelect={selectView} />
              <div className="w-px h-5 bg-surface-tertiary mx-0.5" />
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                onPress={() => setSidebarOpen(!sidebarOpen)}
                aria-label="Toggle details panel"
              >
                {sidebarOpen ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRightOpen className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Network legend — replaces filters in network view */}
            {activeView === "network" && (
              <div className="hidden sm:flex absolute top-3 left-4 z-10 items-center gap-3 bg-surface/90 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border shadow-sm">
                {NETWORK_LEGEND.map((item) => (
                  <span
                    key={item.label}
                    className="flex items-center gap-1.5 text-xs text-muted"
                  >
                    <span
                      className="inline-block w-4 h-0.5"
                      style={{
                        backgroundColor: item.color,
                        backgroundImage: item.dash
                          ? `repeating-linear-gradient(to right, ${item.color} 0 4px, transparent 4px 7px)`
                          : undefined,
                      }}
                    />
                    {item.label}
                  </span>
                ))}
              </div>
            )}

            {/* Filter bar — wrap instead of overflow scroll, which would clip the Type dropdown. */}
            {activeView !== "network" && (
              <div className="flex flex-wrap absolute top-3 left-4 z-10 items-center gap-1 bg-surface/90 backdrop-blur-sm rounded-lg px-2 py-1 border border-border shadow-sm max-w-[calc(100%-2rem)] md:max-w-none">
                {STATUS_FILTER_OPTIONS.map(({ value, label }) => {
                  const active = statusFilters.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() => toggleStatus(value)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors flex-shrink-0 ${
                        active
                          ? "bg-surface-tertiary text-foreground"
                          : "text-muted hover:text-foreground hover:bg-surface-secondary"
                      }`}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClass(value)}`}
                      />
                      {label}
                    </button>
                  );
                })}
                {availableKinds.length > 0 && (
                  <>
                    <div className="w-px h-4 bg-surface-tertiary mx-0.5 flex-shrink-0" />
                    <KindFilterSelect
                      availableKinds={availableKinds}
                      selectedKinds={kindFilters}
                      onChange={setKindFilters}
                    />
                  </>
                )}
                {hasActiveFilter && (
                  <>
                    <div className="w-px h-4 bg-surface-tertiary mx-0.5 flex-shrink-0" />
                    <button
                      onClick={clearFilters}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted hover:text-foreground hover:bg-surface-secondary transition-colors flex-shrink-0"
                    >
                      <X className="w-3 h-3" />
                      Clear
                    </button>
                  </>
                )}
              </div>
            )}

            <div
              className="absolute inset-0"
              style={{ display: activeView === "graph" ? "block" : "none" }}
            >
              <ConnectedGraph
                onResourceClick={(node) => selectNode(node)}
                rootResource={resource}
                filter={activeFilter}
                treeSize={fluxTreeStore.resourceCount}
              />
            </div>

            {activeView === "tree" && (
              <div className="absolute inset-0 overflow-y-auto px-6 pb-6 pt-20 md:pt-16">
                <RenderTreeNode
                  resource={resource}
                  level={0}
                  onResourceClick={(node) => selectNode(node)}
                  filter={activeFilter}
                />
              </div>
            )}

            {/* Network — its own ReactFlow store so it never shares state with the resource graph. */}
            {activeView === "network" && (
              <div className="absolute inset-0">
                <ReactFlowProvider>
                  <NetworkGraph
                    rootResource={resource}
                    onResourceClick={(node) => selectNode(node)}
                    treeSize={fluxTreeStore.resourceCount}
                  />
                </ReactFlowProvider>
              </div>
            )}
          </div>

          {/* Detail panel — docked on desktop, full-screen overlay on mobile */}
          <div
            className={`flex-shrink-0 md:border-l md:border-border md:overflow-hidden md:transition-all md:duration-300 ${
              sidebarOpen
                ? "fixed inset-0 z-40 bg-background animate-slide-in-right md:animate-none md:static md:inset-auto md:z-auto md:bg-transparent md:w-[33vw]"
                : "hidden md:block md:w-0"
            }`}
          >
            <div className="w-full h-full md:w-[33vw] md:h-full flex flex-col">
              <ResourceDetailPanel
                node={selectedNode}
                onClose={() => setSidebarOpen(false)}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
});

export default ResourceView;
