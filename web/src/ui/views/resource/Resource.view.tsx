import "reflect-metadata";
import "@xyflow/react/dist/style.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  FluxResource,
  KubeResource,
  ResourceStatus,
} from "../../../core/fluxTree/models/tree";
import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
} from "@heroui/react";
import AppLogo from "../../components/resource-icon/ResourceIcon";
import ResourceDetailPanel from "../../components/panel/ResourceDetailPanel";
import Header from "../../components/layout/Header";
import { NETWORK_SUBPATH, ROUTES } from "../../routes/routes.enum";
import RenderTreeNode from "../../components/resource-tree/ResourceTree";
import NetworkGraph from "../../components/network/NetworkGraph";
import { ReactFlowProvider } from "@xyflow/react";
import { COLOR_HEALTHY, COLOR_UNHEALTHY } from "../../../core/network/usecases/NetworkTopology.usecase";
import { ResourceFilter } from "../../shared/resourceFilter";
import { statusDotClass } from "../../shared/helpers";
import ReconcileSuspendButtonGroup from "../../components/play-pause/ReconcileSuspendButtonGroup";
import { Check, ChevronDown, List, Network, PanelRightClose, PanelRightOpen, Workflow, X } from "lucide-react";
import StatusChip from "../../components/status-chip/StatusChip";
import ConnectedGraph from "../../components/connected-graph/ConnectedGraph";
import { TYPES } from "../../../core/shared/types";
import { WatchMetricsUseCase } from "../../../core/metrics/usecases/watchMetrics.usecase";
import { StopWatchMetricsUseCase } from "../../../core/metrics/usecases/stopWatchMetrics.usecase";
import { METRICS_KINDS } from "../../../core/metrics/constants/metrics.const";

type ResourceViewMode = "graph" | "tree" | "network";

const NETWORK_LEGEND: { color: string; label: string; dash: boolean }[] = [
  { color: COLOR_HEALTHY, label: "Routable", dash: false },
  { color: COLOR_UNHEALTHY, label: "Pending / not ready", dash: true },
];

const STATUS_FILTER_OPTIONS: { value: ResourceStatus; label: string }[] = [
  { value: ResourceStatus.FAILED, label: "Failed" },
  { value: ResourceStatus.WARNING, label: "Warning" },
  { value: ResourceStatus.PENDING, label: "Pending" },
  { value: ResourceStatus.SUCCESS, label: "Ready" },
];

function collectKinds(node: KubeResource, kinds: Set<string>, visited = new Set<string>()) {
  if (visited.has(node.uid)) return;
  visited.add(node.uid);
  kinds.add(node.kind);
  for (const child of node.children ?? []) collectKinds(child, kinds, visited);
}

type KindFilterSelectProps = {
  availableKinds: string[];
  selectedKinds: string[];
  onChange: (kinds: string[]) => void;
};

function KindFilterSelect({ availableKinds, selectedKinds, onChange }: KindFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(
    () => availableKinds.filter((k) => k.toLowerCase().includes(search.toLowerCase())),
    [availableKinds, search]
  );

  const toggle = (kind: string) =>
    onChange(
      selectedKinds.includes(kind)
        ? selectedKinds.filter((k) => k !== kind)
        : [...selectedKinds, kind]
    );

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
          selectedKinds.length > 0
            ? "bg-content3 text-foreground"
            : "text-default-400 hover:text-foreground hover:bg-content2"
        }`}
      >
        {selectedKinds.length > 0 ? `${selectedKinds.length} types` : "Type"}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-52 bg-content1 border border-default-200 rounded-lg shadow-xl">
          {/* Search input */}
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-default-100">
            <input
              autoFocus
              type="text"
              placeholder="Search types…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-default-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-default-400 hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options */}
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-default-400 px-2 py-2">No matches</p>
            ) : (
              filtered.map((kind) => {
                const selected = selectedKinds.includes(kind);
                return (
                  <button
                    key={kind}
                    onClick={() => toggle(kind)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-content2 text-xs text-left transition-colors"
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
                        selected ? "bg-primary border-primary" : "border-default-400"
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

          {/* Clear footer */}
          {selectedKinds.length > 0 && (
            <div className="border-t border-default-100 p-1">
              <button
                onClick={() => { onChange([]); setOpen(false); setSearch(""); }}
                className="w-full text-left text-xs text-default-400 hover:text-foreground px-2 py-1.5 rounded-md hover:bg-content2 transition-colors"
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

const ResourceView: React.FC = observer(() => {
  const { nodeUid, view } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeView, setActiveView] = useState<ResourceViewMode>(
    view === NETWORK_SUBPATH ? "network" : "graph"
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [statusFilters, setStatusFilters] = useState<ResourceStatus[]>([]);
  const [kindFilters, setKindFilters] = useState<string[]>([]);
  const fluxTreeStore = useInjection(FluxTreeStore);

  const resource = fluxTreeStore.findResourceByUid(nodeUid ?? "");

  // Keep the active view in sync with the URL so browser back/forward and deep
  // links (e.g. /resource/:uid/network) land on the right sub-view. Only the
  // network view carries a URL segment; graph/tree share the base path.
  useEffect(() => {
    if (view === NETWORK_SUBPATH) setActiveView("network");
    else setActiveView((prev) => (prev === "network" ? "graph" : prev));
  }, [view]);

  // Switch sub-view, reflecting the network view in the URL for shareability.
  const selectView = (next: ResourceViewMode) => {
    setActiveView(next);
    if (!resource) return;
    const base = `${ROUTES.RESOURCE}/${resource.uid}`;
    const target = next === "network" ? `${base}/${NETWORK_SUBPATH}` : base;
    if (location.pathname !== target) navigate(target);
  };

  const watchMetrics = useInjection<WatchMetricsUseCase>(TYPES.WatchMetricsUseCase);
  const stopWatchMetrics = useInjection<StopWatchMetricsUseCase>(TYPES.StopWatchMetricsUseCase);

  // Whitelisted UIDs in the visible subtree; joined string keeps the effect
  // dependency stable across tree rebuilds.
  const metricsUids = useMemo(() => {
    if (!resource) return "";
    const uids = new Set<string>();
    const visit = (node: KubeResource, visited: Set<string>) => {
      if (visited.has(node.uid)) return;
      visited.add(node.uid);
      if (METRICS_KINDS.has(node.kind)) uids.add(node.uid);
      for (const child of node.children ?? []) visit(child, visited);
    };
    visit(resource, new Set());
    // Always include the viewed resource so the sidebar usage widget has its
    // aggregate, even when its kind is outside the chip whitelist.
    uids.add(resource.uid);
    return [...uids].sort().join(",");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, fluxTreeStore.tree]);

  useEffect(() => {
    if (!metricsUids) return;
    watchMetrics.execute({ channel: "tree", uids: metricsUids.split(",") });
    return () => stopWatchMetrics.execute("tree");
  }, [metricsUids, watchMetrics, stopWatchMetrics]);

  // The docked detail panel follows the selected node, defaulting to the page's
  // root resource and resetting to it whenever we navigate to a new resource.
  const [selectedNode, setSelectedNode] = useState<KubeResource | undefined>(undefined);
  useEffect(() => {
    setSelectedNode(resource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource?.uid]);

  const fullChain = useMemo(() => fluxTreeStore.findFluxParents(resource?.uid), [fluxTreeStore, resource]);

  const availableKinds = useMemo(() => {
    if (!resource) return [];
    const kinds = new Set<string>();
    collectKinds(resource, kinds);
    return Array.from(kinds).sort();
  }, [resource]);

  const activeFilter: ResourceFilter = useMemo(
    () => ({ statuses: statusFilters, kinds: kindFilters }),
    [statusFilters, kindFilters]
  );

  const hasActiveFilter = statusFilters.length > 0 || kindFilters.length > 0;

  const toggleStatus = (s: ResourceStatus) =>
    setStatusFilters((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  const clearFilters = () => {
    setStatusFilters([]);
    setKindFilters([]);
  };

  const selectNode = (node: KubeResource | undefined) => setSelectedNode(node);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header>
        {resource instanceof FluxResource && resource.isReconcilable && (
          <ReconcileSuspendButtonGroup resource={resource} compact />
        )}
      </Header>

      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Resource identity bar */}
        <div className="flex-shrink-0 px-6 py-2.5 border-b border-default-100 flex items-end gap-4">
          <Breadcrumbs size="sm" className="min-w-0">
            <BreadcrumbItem onPress={() => navigate("/")}>Cluster</BreadcrumbItem>
            {fullChain.map((res) => (
              <BreadcrumbItem key={res.uid} onPress={() => navigate(`/resource/${res.uid}`)}>
                {res.name}
              </BreadcrumbItem>
            ))}
            <BreadcrumbItem>{resource?.name}</BreadcrumbItem>
          </Breadcrumbs>

          <div className="ml-auto flex items-center gap-3 min-w-0">
            <StatusChip resource={resource} />
            <AppLogo kind={resource?.kind} />
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight truncate">{resource?.name}</h1>
              <span className="text-default-400 text-xs">
                {resource?.kind} · {resource?.namespace}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile toolbar — static row with view toggle + filter bar (replaces floating overlays) */}
        <div className="md:hidden flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-default-100">
          <div className="flex items-center gap-1 flex-shrink-0 bg-content1 rounded-lg p-1 border border-default-200">
            <Button
              size="sm"
              variant={activeView === "graph" ? "solid" : "light"}
              onPress={() => selectView("graph")}
              startContent={<Network className="w-3.5 h-3.5" />}
            >
              Graph
            </Button>
            <Button
              size="sm"
              variant={activeView === "tree" ? "solid" : "light"}
              onPress={() => selectView("tree")}
              startContent={<List className="w-3.5 h-3.5" />}
            >
              Tree
            </Button>
            <Button
              size="sm"
              variant={activeView === "network" ? "solid" : "light"}
              onPress={() => selectView("network")}
              startContent={<Workflow className="w-3.5 h-3.5" />}
            >
              Network
            </Button>
          </div>
          {activeView !== "network" && (
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div className="flex items-center gap-1 w-max">
              {STATUS_FILTER_OPTIONS.map(({ value, label }) => {
                const active = statusFilters.includes(value);
                return (
                  <button
                    key={value}
                    onClick={() => toggleStatus(value)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors flex-shrink-0 ${
                      active
                        ? "bg-content3 text-foreground"
                        : "text-default-400 hover:text-foreground hover:bg-content2"
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClass(value)}`} />
                    {label}
                  </button>
                );
              })}
              {availableKinds.length > 0 && (
                <>
                  <div className="w-px h-4 bg-default-200 mx-0.5 flex-shrink-0" />
                  <KindFilterSelect
                    availableKinds={availableKinds}
                    selectedKinds={kindFilters}
                    onChange={setKindFilters}
                  />
                </>
              )}
              {hasActiveFilter && (
                <>
                  <div className="w-px h-4 bg-default-200 mx-0.5 flex-shrink-0" />
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-default-400 hover:text-foreground hover:bg-content2 transition-colors flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Graph + sidebars row */}
        <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden min-h-0">

          {/* Graph / Tree area */}
          <div className="flex-shrink-0 h-[60vh] md:h-auto md:flex-1 md:min-w-0 relative">

            {/* Floating view controls — desktop only */}
            <div className="hidden md:flex absolute top-3 right-4 z-10 items-center gap-1 bg-content1/90 backdrop-blur-sm rounded-lg p-1 border border-default-200 shadow-sm">
              <Button
                size="sm"
                variant={activeView === "graph" ? "solid" : "light"}
                onPress={() => selectView("graph")}
                startContent={<Network className="w-3.5 h-3.5" />}
              >
                Graph
              </Button>
              <Button
                size="sm"
                variant={activeView === "tree" ? "solid" : "light"}
                onPress={() => selectView("tree")}
                startContent={<List className="w-3.5 h-3.5" />}
              >
                Tree
              </Button>
              <Button
                size="sm"
                variant={activeView === "network" ? "solid" : "light"}
                onPress={() => selectView("network")}
                startContent={<Workflow className="w-3.5 h-3.5" />}
              >
                Network
              </Button>
              <div className="w-px h-5 bg-default-200 mx-0.5" />
              <Button
                size="sm"
                variant="light"
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

            {/* Network legend — desktop only, replaces filters in network view */}
            {activeView === "network" && (
              <div className="hidden md:flex absolute top-3 left-4 z-10 items-center gap-3 bg-content1/90 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-default-200 shadow-sm">
                {NETWORK_LEGEND.map((item) => (
                  <span key={item.label} className="flex items-center gap-1.5 text-xs text-default-500">
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

            {/* Filter bar — desktop only (graph/tree only) */}
            {activeView !== "network" && (
            <div className="hidden md:flex absolute top-3 left-4 z-10 items-center gap-1 bg-content1/90 backdrop-blur-sm rounded-lg px-2 py-1 border border-default-200 shadow-sm">
              {STATUS_FILTER_OPTIONS.map(({ value, label }) => {
                const active = statusFilters.includes(value);
                return (
                  <button
                    key={value}
                    onClick={() => toggleStatus(value)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors flex-shrink-0 ${
                      active
                        ? "bg-content3 text-foreground"
                        : "text-default-400 hover:text-foreground hover:bg-content2"
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClass(value)}`} />
                    {label}
                  </button>
                );
              })}
              {availableKinds.length > 0 && (
                <>
                  <div className="w-px h-4 bg-default-200 mx-0.5 flex-shrink-0" />
                  <KindFilterSelect
                    availableKinds={availableKinds}
                    selectedKinds={kindFilters}
                    onChange={setKindFilters}
                  />
                </>
              )}
              {hasActiveFilter && (
                <>
                  <div className="w-px h-4 bg-default-200 mx-0.5 flex-shrink-0" />
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-default-400 hover:text-foreground hover:bg-content2 transition-colors flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                </>
              )}
            </div>
            )}

            {/* Graph */}
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

            {/* Tree */}
            {activeView === "tree" && (
              <div className="absolute inset-0 overflow-y-auto px-6 pb-6 pt-4 md:pt-16">
                <RenderTreeNode
                  resource={resource}
                  level={0}
                  onResourceClick={(node) => selectNode(node)}
                  filter={activeFilter}
                />
              </div>
            )}

            {/* Network — mounted only when active, in its own ReactFlow store so
                it never shares state with the resource graph (app-level provider) */}
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

          {/* Docked detail panel */}
          <div
            className={`flex-shrink-0 border-t border-default-100 md:border-t-0 md:border-l md:border-default-100 md:overflow-hidden md:transition-all md:duration-300 ${
              sidebarOpen ? "md:w-[33vw]" : "md:w-0"
            }`}
          >
            <div className="w-full md:w-[33vw] md:h-full flex flex-col">
              <ResourceDetailPanel node={selectedNode} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
});

export default ResourceView;
