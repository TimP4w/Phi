import "reflect-metadata";
import "@xyflow/react/dist/style.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { useParams } from "react-router-dom";
import {
  FluxResource,
  HelmRelease,
  Kustomization,
  KubeResource,
  ResourceStatus,
} from "../../../core/fluxTree/models/tree";
import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Chip,
  useDisclosure,
} from "@heroui/react";
import AppLogo from "../../components/resource-icon/ResourceIcon";
import ResourceDrawer from "../../components/panel/ResourceDrawer";
import Header from "../../components/layout/Header";
import RenderTreeNode from "../../components/resource-tree/ResourceTree";
import { ResourceFilter } from "../../shared/resourceFilter";
import ReconcileSuspendButtonGroup from "../../components/play-pause/ReconcileSuspendButtonGroup";
import { Bell, Check, ChevronDown, Info, List, Network, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import StatusChip from "../../components/status-chip/StatusChip";
import FluxChainWidget from "../../components/widgets/FluxChainWidget";
import ConnectedGraph from "../../components/connected-graph/ConnectedGraph";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import KustomizationSourceWidget from "../../components/widgets/KustomizationSourceWidget";
import HelmReleaseSourceWidget from "../../components/widgets/HelmReleaseSourceWidget";
import FluxSyncStatusWidget from "../../components/widgets/FluxSyncStatusWidget";
import ResourceStatusWidget from "../../components/widgets/ResourceStatusWidget";
import ResourceCountWidget from "../../components/widgets/ResourcesCountWidget";
import KustomizationDependsOnWidget from "../../components/widgets/KustomizationDependsOnWidget";
import EventsPanel, { EventFilter } from "../../components/events/EventsPanel";

const STATUS_FILTER_OPTIONS: { value: ResourceStatus; label: string; dot: string }[] = [
  { value: ResourceStatus.FAILED, label: "Failed", dot: "bg-danger" },
  { value: ResourceStatus.WARNING, label: "Warning", dot: "bg-warning" },
  { value: ResourceStatus.PENDING, label: "Pending", dot: "bg-primary" },
  { value: ResourceStatus.SUCCESS, label: "Ready", dot: "bg-success" },
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
  const [activeView, setActiveView] = useState<"graph" | "tree">("graph");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [eventSidebarOpen, setEventSidebarOpen] = useState(false);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [statusFilters, setStatusFilters] = useState<ResourceStatus[]>([]);
  const [kindFilters, setKindFilters] = useState<string[]>([]);
  const { nodeUid } = useParams();
  const fluxTreeStore = useInjection(FluxTreeStore);

  const resource = fluxTreeStore.findResourceByUid(nodeUid ?? "");

  const [selectedNode, setSelectedNode] = useState<KubeResource | undefined>(undefined);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const fullChain = useMemo(() => fluxTreeStore.findFluxParents(resource?.uid), [fluxTreeStore, resource]);

  const showFluxSyncStatusWidget = useMemo(
    () => !!resource && resource instanceof FluxResource,
    [resource]
  );
  const showKustomizationSourceWidget = useMemo(
    () => !!resource && resource.kind === RESOURCE_TYPE.KUSTOMIZATION,
    [resource]
  );
  const showHelmReleaseSourceWidget = useMemo(
    () => !!resource && resource.kind === RESOURCE_TYPE.HELM_RELEASE,
    [resource]
  );
  const showResourceStatusWidget = useMemo(
    () => !!resource && !(resource instanceof FluxResource),
    [resource]
  );
  const showKustomizationDependsOnWidget = useMemo(
    () => !!resource && resource instanceof Kustomization,
    [resource]
  );

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

  const openInfo = (node: KubeResource | undefined) => {
    setSelectedNode(node);
    onOpen();
  };

  const allEvents = resource?.events ?? [];
  const displayedEvents = allEvents
    .filter((e) => eventFilter === "all" || e.type === eventFilter)
    .slice()
    .sort((a, b) => b.lastObserved.getTime() - a.lastObserved.getTime());
  const warningCount = allEvents.filter((e) => e.type === "Warning").length;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header showBackButton />

      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Resource identity bar */}
        <div className="flex-shrink-0 px-6 pt-4 pb-3 border-b border-default-100">
          <Breadcrumbs size="sm" className="mb-2">
            <BreadcrumbItem href="/">Cluster</BreadcrumbItem>
            {fullChain.map((res) => (
              <BreadcrumbItem key={res.uid} href={`/resource/${res.uid}`}>
                {res.name}
              </BreadcrumbItem>
            ))}
            <BreadcrumbItem>{resource?.name}</BreadcrumbItem>
          </Breadcrumbs>
          <div className="flex items-center gap-3">
            <AppLogo kind={resource?.kind} />
            <div>
              <h1 className="text-xl font-bold leading-tight">{resource?.name}</h1>
              <span className="text-default-400 text-sm">
                {resource?.kind} · {resource?.namespace}
              </span>
            </div>
            <StatusChip resource={resource} />
            <button
              className={`ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${
                eventSidebarOpen
                  ? "border-default-200 bg-content2 text-foreground"
                  : "border-default-100 bg-content1 hover:bg-content2 text-default-400 hover:text-foreground"
              }`}
              onClick={() => setEventSidebarOpen((o) => !o)}
            >
              <Bell className="w-3.5 h-3.5" />
              Events
              {warningCount > 0 && (
                <Chip size="sm" color="warning" variant="flat" className="h-4 text-xs">
                  {warningCount}
                </Chip>
              )}
            </button>
          </div>
        </div>

        {/* Mobile toolbar — static row with view toggle + filter bar (replaces floating overlays) */}
        <div className="md:hidden flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-default-100">
          <div className="flex items-center gap-1 flex-shrink-0 bg-content1 rounded-lg p-1 border border-default-200">
            <Button
              size="sm"
              variant={activeView === "graph" ? "solid" : "light"}
              onPress={() => setActiveView("graph")}
              startContent={<Network className="w-3.5 h-3.5" />}
            >
              Graph
            </Button>
            <Button
              size="sm"
              variant={activeView === "tree" ? "solid" : "light"}
              onPress={() => setActiveView("tree")}
              startContent={<List className="w-3.5 h-3.5" />}
            >
              Tree
            </Button>
          </div>
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div className="flex items-center gap-1 w-max">
              {STATUS_FILTER_OPTIONS.map(({ value, label, dot }) => {
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
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
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
                onPress={() => setActiveView("graph")}
                startContent={<Network className="w-3.5 h-3.5" />}
              >
                Graph
              </Button>
              <Button
                size="sm"
                variant={activeView === "tree" ? "solid" : "light"}
                onPress={() => setActiveView("tree")}
                startContent={<List className="w-3.5 h-3.5" />}
              >
                Tree
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

            {/* Filter bar — desktop only */}
            <div className="hidden md:flex absolute top-3 left-4 z-10 items-center gap-1 bg-content1/90 backdrop-blur-sm rounded-lg px-2 py-1 border border-default-200 shadow-sm">
              {STATUS_FILTER_OPTIONS.map(({ value, label, dot }) => {
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
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
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

            {/* Graph */}
            <div
              className="absolute inset-0"
              style={{ display: activeView === "graph" ? "block" : "none" }}
            >
              <ConnectedGraph
                onResourceClick={(node) => openInfo(node)}
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
                  onResourceClick={(node) => openInfo(node)}
                  filter={activeFilter}
                />
              </div>
            )}
          </div>

          {/* Widget sidebar */}
          <div
            className={`flex-shrink-0 border-t border-default-100 md:border-t-0 md:flex-shrink-0 md:border-l md:border-default-100 md:overflow-hidden md:transition-all md:duration-300 ${
              sidebarOpen ? "md:w-[320px]" : "md:w-0"
            }`}
          >
            <div className="w-full md:w-[320px] md:h-full flex flex-col">
              {/* Action bar */}
              <div className="flex-shrink-0 px-3 py-3 border-b border-default-100 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="bordered"
                  className="flex-1"
                  onPress={() => openInfo(resource)}
                  startContent={<Info className="w-3.5 h-3.5" />}
                >
                  Details
                </Button>
                {resource instanceof FluxResource && resource.isReconcilable && (
                  <ReconcileSuspendButtonGroup
                    resource={resource as FluxResource}
                    compact
                  />
                )}
              </div>

              {/* Scrollable widgets */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {showKustomizationSourceWidget && (
                  <KustomizationSourceWidget resource={resource as Kustomization} />
                )}
                {showHelmReleaseSourceWidget && (
                  <HelmReleaseSourceWidget resource={resource as HelmRelease} />
                )}
                <FluxChainWidget resource={resource} />
                {showKustomizationDependsOnWidget && (
                  <KustomizationDependsOnWidget resource={resource as Kustomization} />
                )}
                {showFluxSyncStatusWidget && (
                  <FluxSyncStatusWidget resource={resource as FluxResource} />
                )}
                {showResourceStatusWidget && (
                  <ResourceStatusWidget resource={resource} />
                )}
                <ResourceCountWidget resource={resource} skipGrandChildren />
              </div>
            </div>
          </div>

          {/* Desktop events sidebar */}
          <aside
            className={`hidden md:flex-shrink-0 md:flex md:flex-col md:overflow-hidden md:transition-all md:duration-300 md:border-l md:border-default-100 ${
              eventSidebarOpen ? "md:w-[360px]" : "md:w-0"
            }`}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-default-100 flex-shrink-0">
              <span className="text-sm font-semibold">Events</span>
              {warningCount > 0 && (
                <Chip size="sm" color="warning" variant="flat" className="text-xs h-5">
                  {warningCount}
                </Chip>
              )}
            </div>
            <EventsPanel
              events={displayedEvents}
              filter={eventFilter}
              onFilterChange={setEventFilter}
              totalEventCount={allEvents.length}
              showCount
            />
          </aside>
        </div>

        {/* Mobile events bottom sheet */}
        {eventSidebarOpen && (
          <>
            <div
              className="md:hidden fixed inset-0 z-40 bg-black/40"
              onClick={() => setEventSidebarOpen(false)}
            />
            <aside className="md:hidden fixed inset-x-0 bottom-0 z-50 h-[60vh] flex flex-col bg-background border-t-2 border-default-200 shadow-2xl rounded-t-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-default-100 flex-shrink-0">
                <span className="text-sm font-semibold">Events</span>
                {warningCount > 0 && (
                  <Chip size="sm" color="warning" variant="flat" className="text-xs h-5">
                    {warningCount}
                  </Chip>
                )}
                <button
                  className="ml-auto p-1 rounded-md text-default-400 hover:text-foreground hover:bg-content2 transition-colors"
                  onClick={() => setEventSidebarOpen(false)}
                  aria-label="Close events"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <EventsPanel
                events={displayedEvents}
                filter={eventFilter}
                onFilterChange={setEventFilter}
                totalEventCount={allEvents.length}
                showCount
              />
            </aside>
          </>
        )}
      </main>

      <ResourceDrawer
        node={selectedNode}
        onOpenChange={onOpenChange}
        isOpen={isOpen}
      />
    </div>
  );
});

export default ResourceView;
