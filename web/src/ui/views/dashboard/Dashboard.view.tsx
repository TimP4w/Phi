import "reflect-metadata";

import React, { ChangeEvent, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import {
  FluxResource,
  ResourceStatus,
} from "../../../core/fluxTree/models/tree";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { Input, Select, SelectItem, Spacer } from "@heroui/react";
import App from "../../components/flux-resource-card/FluxResourceCard";
import FluxControllersWidget from "../../components/widgets/FluxControllersWidget";
import FluxApplicationsWidget from "../../components/widgets/FluxApplicationsWidget";
import FluxKindsWidget from "../../components/widgets/FluxKindsWidget";
import { useSessionState } from "../../../core/utils/useSessionState";
import Header from "../../components/layout/Header";
import { SiFlux } from "@icons-pack/react-simple-icons";
import ResourceCountWidget from "../../components/widgets/ResourcesCountWidget";
import { fetchTreeUseCase } from "../../../core/fluxTree/usecases/FetchTree.usecase";

const kindsFilter = [
  {
    label: "Kustomizations",
    key: RESOURCE_TYPE.KUSTOMIZATION,
    filter: (resource: FluxResource) =>
      resource.kind === RESOURCE_TYPE.KUSTOMIZATION,
  },
  {
    label: "HelmReleases",
    key: RESOURCE_TYPE.HELM_RELEASE,
    filter: (resource: FluxResource) =>
      resource.kind === RESOURCE_TYPE.HELM_RELEASE,
  },
  {
    label: "HelmRepositories",
    key: RESOURCE_TYPE.HELM_REPOSITORY,
    filter: (resource: FluxResource) =>
      resource.kind === RESOURCE_TYPE.HELM_REPOSITORY,
  },
  {
    label: "HelmCharts",
    key: RESOURCE_TYPE.HELM_CHART,
    filter: (resource: FluxResource) =>
      resource.kind === RESOURCE_TYPE.HELM_CHART,
  },
  {
    label: "GitRepositories",
    key: RESOURCE_TYPE.GIT_REPOSITORY,
    filter: (resource: FluxResource) =>
      resource.kind === RESOURCE_TYPE.GIT_REPOSITORY,
  },
  {
    label: "OCIRepositories",
    key: RESOURCE_TYPE.OCI_REPOSITORY,
    filter: (resource: FluxResource) =>
      resource.kind === RESOURCE_TYPE.OCI_REPOSITORY,
  },
  {
    label: "Buckets",
    key: RESOURCE_TYPE.BUCKET,
    filter: (resource: FluxResource) => resource.kind === RESOURCE_TYPE.BUCKET,
  },
];

const statusFilter = [
  {
    label: "Ready",
    key: ResourceStatus.SUCCESS,
    filter: (resource: FluxResource) =>
      resource.status === ResourceStatus.SUCCESS,
  },
  {
    label: "Reconciling",
    key: ResourceStatus.PENDING,
    filter: (resource: FluxResource) =>
      resource.status === ResourceStatus.PENDING,
  },
  {
    label: "Not Ready",
    key: ResourceStatus.WARNING,
    filter: (resource: FluxResource) =>
      resource.status === ResourceStatus.FAILED ||
      resource.status === ResourceStatus.WARNING,
  },
  {
    label: "Unknown",
    key: ResourceStatus.UNKNOWN,
    filter: (resource: FluxResource) =>
      resource.status === ResourceStatus.UNKNOWN,
  },
];

const suspendedFilter = [
  {
    label: "Suspended",
    key: "suspended",
    filter: (resource: FluxResource) => !!resource.isSuspended,
  },
  {
    label: "Not Suspended",
    key: "resumed",
    filter: (resource: FluxResource) => !resource.isSuspended,
  },
];

enum APP_FILTER {
  KIND,
  STATUS,
  SUSPEND,
}

const AppsView: React.FC = observer(() => {
  const fluxTreeStore = useInjection(FluxTreeStore);

  const [selectedKindsToFilter, setSelectedKindsToFilter] = useSessionState<
    string[]
  >("KindsFilter", []);
  const [selectedStatusesToFilter, setSelectedStatusesToFilter] =
    useSessionState<string[]>("StatusesFilter", []);
  const [selectedSuspendStatusesToFilter, setSelectedSuspendStatusesToFilter] =
    useSessionState<string[]>("SuspendFilter", []);
  const [searchValue, setSearchValue] = useSessionState<string>(
    "SearchValueFilter",
    ""
  );

  useEffect(() => {
    fetchTreeUseCase.execute();
  }, []);

  const onFilterChange = (
    e: ChangeEvent<HTMLSelectElement>,
    filter: APP_FILTER
  ) => {
    const selectedValues = e.target.value
      .split(",")
      .filter((val: string) => val !== "");

    switch (filter) {
      case APP_FILTER.KIND:
        setSelectedKindsToFilter(selectedValues);
        break;
      case APP_FILTER.STATUS:
        setSelectedStatusesToFilter(selectedValues);
        break;
      case APP_FILTER.SUSPEND:
        setSelectedSuspendStatusesToFilter(selectedValues);
        break;
    }
  };

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
        toggleFilterValue(
          selectedKindsToFilter,
          setSelectedKindsToFilter,
          value
        );
        break;
      case APP_FILTER.STATUS:
        toggleFilterValue(
          selectedStatusesToFilter,
          setSelectedStatusesToFilter,
          value
        );
        break;
      case APP_FILTER.SUSPEND:
        toggleFilterValue(
          selectedSuspendStatusesToFilter,
          setSelectedSuspendStatusesToFilter,
          value
        );
        break;
    }
  };

  const onSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
  };

  const filterFunction = (resource: FluxResource) => {
    const kindFiltersFuncs = kindsFilter
      .filter((kindFilter) => selectedKindsToFilter.includes(kindFilter.key))
      .map((k) => k.filter);

    const statusFiltersFuncs = statusFilter
      .filter((sF) => selectedStatusesToFilter.includes(sF.key))
      .map((sF) => sF.filter);

    const suspendFiltersFuncs = suspendedFilter
      .filter((sF) => selectedSuspendStatusesToFilter.includes(sF.key))
      .map((sF) => sF.filter);

    const allFilters = [
      kindFiltersFuncs,
      statusFiltersFuncs,
      suspendFiltersFuncs,
    ];

    const isMatchingSearchValue = resource.name
      .toLowerCase()
      .includes(searchValue.toLowerCase());

    return (
      allFilters
        .filter((filters) => filters.length > 0)
        .map((filters) => filters.reduce((a, b) => (x) => a(x) || b(x)))
        .reduce(
          (a, b) => (x) => a(x) && b(x),
          () => true
        )(resource) && isMatchingSearchValue
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-[2400px] py-6 px-8 transition-all duration-300 flex flex-col mr-auto ml-auto">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 xxl:grid-cols-5">
          <FluxControllersWidget />
          <FluxApplicationsWidget
            filters={selectedStatusesToFilter}
            toggleStatusFilter={(status) =>
              onFilterToggle(status, APP_FILTER.STATUS)
            }
          />
          <FluxKindsWidget
            filters={selectedKindsToFilter}
            toggleKindsFilter={(kind) => onFilterToggle(kind, APP_FILTER.KIND)}
          />
          <ResourceCountWidget resource={fluxTreeStore.root} />
        </div>
        <Spacer y={12} />
        <div className="flex flex-col">
          <span className="flex text-3xl font-bold items-center gap-3">
            <SiFlux color="#326CE5" />
            Applications
          </span>
          <span className="text-default-400">
            Manage your Flux applications and repositories
          </span>
        </div>
        <Spacer y={10} />
        <div className="flex flex-wrap gap-3">
          <Input
            className="max-w-[320px]"
            defaultValue={searchValue}
            placeholder="Search applications..."
            radius="md"
            type="text"
            onChange={onSearchChange}
          />
          <Select
            className="max-w-[160px]"
            placeholder="All Kinds"
            selectedKeys={selectedKindsToFilter}
            defaultSelectedKeys={selectedKindsToFilter}
            selectionMode="multiple"
            onChange={(e) => onFilterChange(e, APP_FILTER.KIND)}
          >
            {kindsFilter.map((kind) => (
              <SelectItem key={kind.key}>{kind.label}</SelectItem>
            ))}
          </Select>
          <Select
            className="max-w-[160px]"
            placeholder="All Statuses"
            selectedKeys={selectedStatusesToFilter}
            defaultSelectedKeys={selectedStatusesToFilter}
            selectionMode="multiple"
            onChange={(e) => onFilterChange(e, APP_FILTER.STATUS)}
          >
            {statusFilter.map((status) => (
              <SelectItem className="dark" key={status.key}>
                {status.label}
              </SelectItem>
            ))}
          </Select>
          <Select
            className="max-w-[160px]"
            placeholder="All States"
            selectionMode="multiple"
            onChange={(e) => onFilterChange(e, APP_FILTER.SUSPEND)}
          >
            {suspendedFilter.map((suspended) => (
              <SelectItem className="dark" key={suspended.key}>
                {suspended.label}
              </SelectItem>
            ))}
          </Select>
        </div>
        <Spacer y={8} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xxl:grid-cols-5 w-full">
          {(() => {
            const filtered = [
              ...fluxTreeStore.applications,
              ...fluxTreeStore.repositories,
            ].filter(filterFunction);
            return filtered.length > 0 ? (
              filtered.map((fluxResource) => (
                <App key={fluxResource.uid} node={fluxResource} />
              ))
            ) : (
              <div className="text-default-400 text-lg py-12">
                No applications found matching your criteria.
              </div>
            );
          })()}
        </div>
      </main>
    </div>
  );
});

export default AppsView;
