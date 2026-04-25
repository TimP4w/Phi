import "reflect-metadata";

import React, { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { FluxResource, ResourceStatus } from "../../../core/fluxTree/models/tree";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { Chip, Input } from "@heroui/react";
import App from "../../components/flux-resource-card/FluxResourceCard";
import FluxControllersWidget from "../../components/widgets/FluxControllersWidget";
import FluxApplicationsWidget from "../../components/widgets/FluxApplicationsWidget";
import FluxKindsWidget from "../../components/widgets/FluxKindsWidget";
import { useSessionState } from "../../../core/utils/useSessionState";
import Header from "../../components/layout/Header";
import { SiFlux } from "@icons-pack/react-simple-icons";
import ResourceCountWidget from "../../components/widgets/ResourcesCountWidget";
import { fetchTreeUseCase } from "../../../core/fluxTree/usecases/FetchTree.usecase";
import { EventsStore } from "../../../core/fluxTree/stores/events.store";
import { ROUTES } from "../../routes/routes.enum";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Bell, BellOff, Search, X } from "lucide-react";

const kindsFilter = [
  {
    label: "Kustomization",
    key: RESOURCE_TYPE.KUSTOMIZATION,
    filter: (r: FluxResource) => r.kind === RESOURCE_TYPE.KUSTOMIZATION,
  },
  {
    label: "HelmRelease",
    key: RESOURCE_TYPE.HELM_RELEASE,
    filter: (r: FluxResource) => r.kind === RESOURCE_TYPE.HELM_RELEASE,
  },
  {
    label: "HelmRepository",
    key: RESOURCE_TYPE.HELM_REPOSITORY,
    filter: (r: FluxResource) => r.kind === RESOURCE_TYPE.HELM_REPOSITORY,
  },
  {
    label: "HelmChart",
    key: RESOURCE_TYPE.HELM_CHART,
    filter: (r: FluxResource) => r.kind === RESOURCE_TYPE.HELM_CHART,
  },
  {
    label: "GitRepository",
    key: RESOURCE_TYPE.GIT_REPOSITORY,
    filter: (r: FluxResource) => r.kind === RESOURCE_TYPE.GIT_REPOSITORY,
  },
  {
    label: "OCIRepository",
    key: RESOURCE_TYPE.OCI_REPOSITORY,
    filter: (r: FluxResource) => r.kind === RESOURCE_TYPE.OCI_REPOSITORY,
  },
  {
    label: "Bucket",
    key: RESOURCE_TYPE.BUCKET,
    filter: (r: FluxResource) => r.kind === RESOURCE_TYPE.BUCKET,
  },
];

const statusFilter: {
  label: string;
  key: ResourceStatus;
  color: "success" | "danger" | "warning" | "default";
  filter: (r: FluxResource) => boolean;
}[] = [
  {
    label: "Ready",
    key: ResourceStatus.SUCCESS,
    color: "success",
    filter: (r) => r.status === ResourceStatus.SUCCESS,
  },
  {
    label: "Not Ready",
    key: ResourceStatus.FAILED,
    color: "danger",
    filter: (r) =>
      r.status === ResourceStatus.FAILED || r.status === ResourceStatus.WARNING,
  },
  {
    label: "Reconciling",
    key: ResourceStatus.PENDING,
    color: "warning",
    filter: (r) => r.status === ResourceStatus.PENDING,
  },
  {
    label: "Unknown",
    key: ResourceStatus.UNKNOWN,
    color: "default",
    filter: (r) => r.status === ResourceStatus.UNKNOWN,
  },
];

const suspendedFilter = [
  {
    label: "Suspended",
    key: "suspended",
    filter: (r: FluxResource) => !!r.isSuspended,
  },
  {
    label: "Active",
    key: "resumed",
    filter: (r: FluxResource) => !r.isSuspended,
  },
];

enum APP_FILTER {
  KIND,
  STATUS,
  SUSPEND,
}

type EventFilter = "all" | "Warning" | "Normal";

const AppsView: React.FC = observer(() => {
  const fluxTreeStore = useInjection(FluxTreeStore);
  const eventsStore = useInjection(EventsStore);

  const [selectedKindsToFilter, setSelectedKindsToFilter] = useSessionState<string[]>("KindsFilter", []);
  const [selectedStatusesToFilter, setSelectedStatusesToFilter] = useSessionState<string[]>("StatusesFilter", []);
  const [selectedSuspendStatusesToFilter, setSelectedSuspendStatusesToFilter] = useSessionState<string[]>("SuspendFilter", []);
  const [searchValue, setSearchValue] = useSessionState<string>("SearchValueFilter", "");
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [eventSidebarOpen, setEventSidebarOpen] = useState(true);

  useEffect(() => {
    fetchTreeUseCase.execute();
  }, []);

  const toggleFilterValue = (
    selected: string[],
    setSelected: (val: string[]) => void,
    value: string
  ) => {
    setSelected(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  const onFilterToggle = (value: string, filter: APP_FILTER) => {
    switch (filter) {
      case APP_FILTER.KIND:
        toggleFilterValue(selectedKindsToFilter, setSelectedKindsToFilter, value);
        break;
      case APP_FILTER.STATUS:
        toggleFilterValue(selectedStatusesToFilter, setSelectedStatusesToFilter, value);
        break;
      case APP_FILTER.SUSPEND:
        toggleFilterValue(selectedSuspendStatusesToFilter, setSelectedSuspendStatusesToFilter, value);
        break;
    }
  };

  const filterFunction = (resource: FluxResource) => {
    const kindFiltersFuncs = kindsFilter
      .filter((f) => selectedKindsToFilter.includes(f.key))
      .map((f) => f.filter);
    const statusFiltersFuncs = statusFilter
      .filter((f) => selectedStatusesToFilter.includes(f.key))
      .map((f) => f.filter);
    const suspendFiltersFuncs = suspendedFilter
      .filter((f) => selectedSuspendStatusesToFilter.includes(f.key))
      .map((f) => f.filter);

    const allFilters = [kindFiltersFuncs, statusFiltersFuncs, suspendFiltersFuncs];
    const isMatchingSearch = resource.name
      .toLowerCase()
      .includes(searchValue.toLowerCase());

    return (
      allFilters
        .filter((filters) => filters.length > 0)
        .map((filters) => filters.reduce((a, b) => (x) => a(x) || b(x)))
        .reduce(
          (a, b) => (x) => a(x) && b(x),
          () => true
        )(resource) && isMatchingSearch
    );
  };

  const filtered = [
    ...fluxTreeStore.applications,
    ...fluxTreeStore.repositories,
  ].filter(filterFunction);

  const hasActiveFilters =
    selectedKindsToFilter.length > 0 ||
    selectedStatusesToFilter.length > 0 ||
    selectedSuspendStatusesToFilter.length > 0 ||
    searchValue.length > 0;

  const clearFilters = () => {
    setSelectedKindsToFilter([]);
    setSelectedStatusesToFilter([]);
    setSelectedSuspendStatusesToFilter([]);
    setSearchValue("");
  };

  const displayedEvents = eventsStore.events
    .filter((e) => eventFilter === "all" || e.type === eventFilter)
    .slice()
    .sort((a, b) => b.lastObserved.getTime() - a.lastObserved.getTime());

  const warningCount = eventsStore.events.filter((e) => e.type === "Warning").length;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <Header />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 flex flex-col gap-6">

            {/* Widgets row */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="xl:col-span-2">
                <FluxControllersWidget />
              </div>
              <FluxApplicationsWidget
                filters={selectedStatusesToFilter}
                toggleStatusFilter={(status) => onFilterToggle(status, APP_FILTER.STATUS)}
              />
              <FluxKindsWidget
                filters={selectedKindsToFilter}
                toggleKindsFilter={(kind) => onFilterToggle(kind, APP_FILTER.KIND)}
              />
              <ResourceCountWidget resource={fluxTreeStore.root} />
            </div>

            {/* Section header */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <SiFlux color="#326CE5" className="w-5 h-5 flex-shrink-0" />
                <div>
                  <h2 className="text-lg font-bold leading-tight">Applications</h2>
                  <p className="text-xs text-default-400">
                    {filtered.length} resource{filtered.length !== 1 ? "s" : ""}
                    {hasActiveFilters ? " matching filters" : " total"}
                  </p>
                </div>
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

              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-[220px]"
                  value={searchValue}
                  placeholder="Search by name…"
                  radius="md"
                  size="sm"
                  type="text"
                  startContent={<Search className="w-3.5 h-3.5 text-default-400 flex-shrink-0" />}
                  onChange={(e) => setSearchValue(e.target.value)}
                />

                <div className="flex flex-wrap items-center gap-1">
                  {statusFilter.map((f) => (
                    <Chip
                      key={f.key}
                      size="sm"
                      variant={selectedStatusesToFilter.includes(f.key) ? "solid" : "flat"}
                      color={selectedStatusesToFilter.includes(f.key) ? f.color : "default"}
                      className="cursor-pointer"
                      onClick={() => onFilterToggle(f.key, APP_FILTER.STATUS)}
                    >
                      {f.label}
                    </Chip>
                  ))}
                </div>

                <div className="h-4 w-px bg-default-200 hidden sm:block" />

                <div className="flex flex-wrap items-center gap-1">
                  {kindsFilter.map((f) => (
                    <Chip
                      key={f.key}
                      size="sm"
                      variant={selectedKindsToFilter.includes(f.key) ? "solid" : "flat"}
                      className="cursor-pointer"
                      onClick={() => onFilterToggle(f.key, APP_FILTER.KIND)}
                    >
                      {f.label}
                    </Chip>
                  ))}
                </div>

                <div className="h-4 w-px bg-default-200 hidden sm:block" />

                <div className="flex flex-wrap items-center gap-1">
                  {suspendedFilter.map((f) => (
                    <Chip
                      key={f.key}
                      size="sm"
                      variant={selectedSuspendStatusesToFilter.includes(f.key) ? "solid" : "flat"}
                      className="cursor-pointer"
                      onClick={() => onFilterToggle(f.key, APP_FILTER.SUSPEND)}
                    >
                      {f.label}
                    </Chip>
                  ))}
                </div>

                {hasActiveFilters && (
                  <button
                    className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors"
                    onClick={clearFilters}
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Resource grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-8">
              {filtered.length > 0 ? (
                filtered.map((resource) => (
                  <App key={resource.uid} node={resource} />
                ))
              ) : (
                <div className="col-span-full text-center text-default-400 text-sm py-16">
                  No applications match your filters.
                </div>
              )}
            </div>

          </div>
        </main>

        {/* Events sidebar */}
        <aside
          className={`flex-shrink-0 border-l border-default-100 flex flex-col overflow-hidden transition-all duration-300 ${
            eventSidebarOpen ? "w-[480px]" : "w-0"
          }`}
        >
          {/* Sidebar header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-default-100 flex-shrink-0">
            <span className="text-sm font-semibold">Events</span>
            {warningCount > 0 && (
              <Chip size="sm" color="warning" variant="flat" className="text-xs h-5">
                {warningCount}
              </Chip>
            )}
            <div className="ml-auto flex gap-1">
              {(["all", "Warning", "Normal"] as EventFilter[]).map((f) => (
                <Chip
                  key={f}
                  size="sm"
                  variant={eventFilter === f ? "solid" : "flat"}
                  color={eventFilter === f && f === "Warning" ? "warning" : "default"}
                  className="cursor-pointer select-none"
                  onClick={() => setEventFilter(f)}
                >
                  {f === "all" ? "All" : f}
                </Chip>
              ))}
            </div>
          </div>

          {/* Event list */}
          {eventSidebarOpen && (
            <div className="flex-1 overflow-y-auto">
              {displayedEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-default-400">
                  <BellOff className="w-8 h-8 opacity-30" />
                  <span className="text-sm">No events</span>
                </div>
              ) : (
                <div className="divide-y divide-default-100">
                  {displayedEvents.map((event, i) => (
                    <div
                      key={`${event.uid}_${i}`}
                      className={`px-4 py-2.5 hover:bg-content2 transition-colors ${
                        event.type === "Warning" ? "bg-warning/[0.04]" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <div
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            event.type === "Warning" ? "bg-warning" : "bg-primary"
                          }`}
                        />
                        <span className="text-xs font-medium flex-1 min-w-0 truncate">
                          {event.reason}
                        </span>
                        <span className="text-xs text-default-500 flex-shrink-0 tabular-nums">
                          {format(event.lastObserved, "HH:mm:ss")}
                        </span>
                      </div>
                      <p className="text-xs text-default-400 line-clamp-2 pl-3.5 leading-relaxed">
                        {event.message}
                      </p>
                      <div className="pl-3.5 mt-1">
                        <Link
                          to={`${ROUTES.RESOURCE}/${event.resourceUID}`}
                          className="text-xs font-mono text-default-500 hover:text-foreground transition-colors truncate block"
                        >
                          {event.kind}/{event.name}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
});

export default AppsView;
