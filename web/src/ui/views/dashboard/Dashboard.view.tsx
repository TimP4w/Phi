import "reflect-metadata";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { Chip, Input } from "@heroui/react";
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
                  <p className="text-xs text-default-400">
                    {filtered.length} resource{filtered.length !== 1 ? "s" : ""}
                    {hasActiveFilters ? " matching filters" : " total"}
                  </p>
                </div>
                <button
                  className={`ml-auto flex items-center justify-center w-8 h-8 rounded-lg border transition-colors flex-shrink-0 ${
                    sidebarOpen
                      ? "border-default-200 bg-content2 text-foreground"
                      : "border-default-100 bg-content1 hover:bg-content2 text-default-400 hover:text-foreground"
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
                <Input
                  ref={searchRef}
                  className={`transition-all duration-200 ${searchFocused ? "max-w-[340px]" : "max-w-[220px]"}`}
                  value={searchValue}
                  placeholder="Search by name…"
                  radius="md"
                  size="sm"
                  type="text"
                  color={searchFocused ? "primary" : "default"}
                  startContent={<Search className={`w-3.5 h-3.5 flex-shrink-0 ${searchFocused ? "text-primary" : "text-default-400"}`} />}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />

                <div className="flex flex-wrap items-center gap-1">
                  {STATUS_FILTERS.map((f) => (
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
                  {KIND_FILTERS.map((f) => (
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
                  {SUSPEND_FILTERS.map((f) => (
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

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-8">
              {filtered.length > 0 ? (
                filtered.map((resource) => (
                  <FluxResourceCard key={resource.uid} node={resource} />
                ))
              ) : (
                <div className="col-span-full text-center text-default-400 text-sm py-16">
                  No applications match your filters.
                </div>
              )}
            </div>

          </div>
        </main>

        {/* Right rail: overlays the content on small screens so it never squeezes the main column off-screen. */}
        <aside
          className={`flex-shrink-0 border-l border-default-100 overflow-y-auto bg-background transition-all duration-300 absolute inset-y-0 right-0 z-30 lg:static lg:z-auto ${
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
