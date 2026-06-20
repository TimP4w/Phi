import "reflect-metadata";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { Chip, Input, Skeleton } from "@heroui/react";
import FluxResourceCard from "../../components/flux-resource-card/FluxResourceCard";
import { useSessionState } from "../../../core/utils/useSessionState";
import Header from "../../components/layout/Header";
import { SiFlux } from "@icons-pack/react-simple-icons";
import { PanelRightClose, PanelRightOpen, Search, X } from "lucide-react";
import { TYPES } from "../../../core/shared/types";
import { WatchMetricsUseCase } from "../../../core/metrics/usecases/watchMetrics.usecase";
import { StopWatchMetricsUseCase } from "../../../core/metrics/usecases/stopWatchMetrics.usecase";
import ClusterInspector from "../../components/summary/ClusterInspector";
import {
  ApplicationFilter,
  KIND_FILTERS,
  STATUS_FILTERS,
  SUSPEND_FILTERS,
  applicationMatchesFilter,
  hasActiveApplicationFilter,
} from "../../shared/applicationFilter";

enum APP_FILTER {
  KIND,
  STATUS,
  SUSPEND,
}

// Placeholder card shown while the first resource snapshot is still loading.
const LoadingCard: React.FC = () => (
  <div className="flex flex-col rounded-xl bg-surface border border-border overflow-hidden">
    <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
      <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <Skeleton className="h-3.5 w-2/3 rounded" />
        <Skeleton className="h-3 w-1/2 rounded" />
      </div>
    </div>
    <div className="px-4 pb-3 flex gap-2">
      <Skeleton className="h-3 w-16 rounded" />
      <Skeleton className="h-3 w-12 rounded" />
    </div>
    <div className="border-t border-border flex flex-col gap-2 px-4 py-3">
      <Skeleton className="h-3 w-full rounded" />
      <Skeleton className="h-3 w-4/5 rounded" />
      <Skeleton className="h-3 w-3/5 rounded" />
    </div>
  </div>
);

const AppsView: React.FC = observer(() => {
  const fluxTreeStore = useInjection(FluxTreeStore);
  const watchMetrics = useInjection<WatchMetricsUseCase>(TYPES.WatchMetricsUseCase);
  const stopWatchMetrics = useInjection<StopWatchMetricsUseCase>(TYPES.StopWatchMetricsUseCase);

  const appUids = useMemo(
    () =>
      fluxTreeStore.applications
        .filter((a) => a.kind === RESOURCE_TYPE.KUSTOMIZATION || a.kind === RESOURCE_TYPE.HELM_RELEASE)
        .map((a) => a.uid)
        .sort()
        .join(","),
    [fluxTreeStore.applications]
  );

  useEffect(() => {
    watchMetrics.execute({
      channel: "dashboard",
      uids: appUids ? appUids.split(",") : [],
      nodes: true,
    });
    return () => stopWatchMetrics.execute("dashboard");
  }, [appUids, watchMetrics, stopWatchMetrics]);

  const [selectedKindsToFilter, setSelectedKindsToFilter] = useSessionState<string[]>("KindsFilter", []);
  const [selectedStatusesToFilter, setSelectedStatusesToFilter] = useSessionState<string[]>("StatusesFilter", []);
  const [selectedSuspendStatusesToFilter, setSelectedSuspendStatusesToFilter] = useSessionState<string[]>("SuspendFilter", []);
  const [searchValue, setSearchValue] = useSessionState<string>("SearchValueFilter", "");
  // Open by default on desktop, closed on the full-screen mobile overlay.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "f" && e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape" && document.activeElement === searchRef.current) {
        searchRef.current?.blur();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
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

  const filter: ApplicationFilter = {
    search: searchValue,
    kinds: selectedKindsToFilter,
    statuses: selectedStatusesToFilter,
    suspend: selectedSuspendStatusesToFilter,
  };

  const filtered = fluxTreeStore.dashboardResources.filter((r) =>
    applicationMatchesFilter(r, filter),
  );

  const hasActiveFilters = hasActiveApplicationFilter(filter);

  const clearFilters = () => {
    setSelectedKindsToFilter([]);
    setSelectedStatusesToFilter([]);
    setSelectedSuspendStatusesToFilter([]);
    setSearchValue("");
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <Header />

      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        <main className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 flex flex-col gap-6">

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <SiFlux color="#326CE5" className="w-5 h-5 flex-shrink-0" />
                <div>
                  <h2 className="text-lg font-bold leading-tight">Applications</h2>
                  <p className="text-xs text-muted">
                    {filtered.length} resource{filtered.length !== 1 ? "s" : ""}
                    {hasActiveFilters ? " matching filters" : " total"}
                  </p>
                </div>
                <button
                  className={`ml-auto flex items-center justify-center w-8 h-8 rounded-lg border transition-colors flex-shrink-0 ${
                    sidebarOpen
                      ? "border-border bg-surface-secondary text-foreground"
                      : "border-border bg-surface hover:bg-surface-secondary text-muted hover:text-foreground"
                  }`}
                  onClick={() => setSidebarOpen((o) => !o)}
                  aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                >
                  {sidebarOpen ? (
                    <PanelRightClose className="w-4 h-4" />
                  ) : (
                    <PanelRightOpen className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className={`relative transition-all duration-200 ${searchFocused ? "max-w-[340px]" : "max-w-[220px]"}`}
                >
                  <Search
                    className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none ${searchFocused ? "text-foreground" : "text-muted"}`}
                  />
                  <Input
                    ref={searchRef}
                    className="pl-8 w-full"
                    value={searchValue}
                    placeholder="Search by name…"
                    type="text"
                    onChange={(e) => setSearchValue(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {STATUS_FILTERS.map((f) => (
                    <Chip
                      key={f.key}
                      size="sm"
                      variant={selectedStatusesToFilter.includes(f.key) ? "primary" : "soft"}
                      color={selectedStatusesToFilter.includes(f.key) ? f.color : "default"}
                      className="cursor-pointer"
                      onClick={() => onFilterToggle(f.key, APP_FILTER.STATUS)}
                    >
                      {f.label}
                    </Chip>
                  ))}
                </div>

                <div className="h-4 w-px bg-surface-tertiary hidden sm:block" />

                <div className="flex flex-wrap items-center gap-1">
                  {KIND_FILTERS.map((f) => (
                    <Chip
                      key={f.key}
                      size="sm"
                      variant={selectedKindsToFilter.includes(f.key) ? "primary" : "soft"}
                      className="cursor-pointer"
                      onClick={() => onFilterToggle(f.key, APP_FILTER.KIND)}
                    >
                      {f.label}
                    </Chip>
                  ))}
                </div>

                <div className="h-4 w-px bg-surface-tertiary hidden sm:block" />

                <div className="flex flex-wrap items-center gap-1">
                  {SUSPEND_FILTERS.map((f) => (
                    <Chip
                      key={f.key}
                      size="sm"
                      variant={selectedSuspendStatusesToFilter.includes(f.key) ? "primary" : "soft"}
                      className="cursor-pointer"
                      onClick={() => onFilterToggle(f.key, APP_FILTER.SUSPEND)}
                    >
                      {f.label}
                    </Chip>
                  ))}
                </div>

                {hasActiveFilters && (
                  <button
                    className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
                    onClick={clearFilters}
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-8">
              {!fluxTreeStore.loaded ? (
                Array.from({ length: 8 }).map((_, i) => <LoadingCard key={i} />)
              ) : filtered.length > 0 ? (
                filtered.map((resource) => (
                  <FluxResourceCard key={resource.uid} node={resource} />
                ))
              ) : (
                <div className="col-span-full text-center text-muted text-sm py-16">
                  No applications match your filters.
                </div>
              )}
            </div>

          </div>
        </main>

        {/* Right rail: overlays the content on small screens so it never squeezes the main column off-screen. */}
        <aside
          className={`flex-shrink-0 border-l border-border overflow-y-auto bg-background transition-all duration-300 absolute inset-y-0 right-0 z-30 lg:static lg:z-auto ${
            sidebarOpen ? "w-full sm:w-[440px]" : "w-0"
          }`}
        >
          {sidebarOpen && (
            <ClusterInspector
              onClose={() => setSidebarOpen(false)}
              selectedKinds={selectedKindsToFilter}
              onToggleKind={(kind) => onFilterToggle(kind, APP_FILTER.KIND)}
            />
          )}
        </aside>
      </div>
    </div>
  );
});

export default AppsView;
