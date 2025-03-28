import "reflect-metadata";

import React, { useState } from "react";
import "./apps.scss";
import { observer } from "mobx-react-lite";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import { ResourceStatus, TreeNode } from "../../../core/fluxTree/models/tree";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { Select, SelectItem } from "@heroui/react";
import App from "../../components/app/App";

import FluxControllersCard from "../../components/status-cards/FluxControllersCard";
import FluxApplicationsCard from "../../components/status-cards/FluxApplicationsCard";
import FluxRepositoriesCard from "../../components/status-cards/FluxRepositoriesCard";
import FluxKindsCard from "../../components/status-cards/FluxKindsCard";

const kindsFilter = [
  {
    label: "Kustomizations",
    key: RESOURCE_TYPE.KUSTOMIZATION,
    filter: (node: TreeNode) => node.kind === RESOURCE_TYPE.KUSTOMIZATION,
  },
  {
    label: "HelmReleases",
    key: RESOURCE_TYPE.HELM_RELEASE,
    filter: (node: TreeNode) => node.kind === RESOURCE_TYPE.HELM_RELEASE,
  },
  {
    label: "HelmCharts",
    key: RESOURCE_TYPE.HELM_CHART,
    filter: (node: TreeNode) => node.kind === RESOURCE_TYPE.HELM_CHART,
  },
  {
    label: "GitRepositories",
    key: RESOURCE_TYPE.GIT_REPOSITORY,
    filter: (node: TreeNode) => node.kind === RESOURCE_TYPE.GIT_REPOSITORY,
  },
  {
    label: "OCIRepositories",
    key: RESOURCE_TYPE.OCI_REPOSITORY,
    filter: (node: TreeNode) => node.kind === RESOURCE_TYPE.OCI_REPOSITORY,
  },
  {
    label: "Buckets",
    key: RESOURCE_TYPE.BUCKET,
    filter: (node: TreeNode) => node.kind === RESOURCE_TYPE.BUCKET,
  },
];

const statusFilter = [
  {
    label: "Healthy",
    key: ResourceStatus.SUCCESS,
    filter: (node: TreeNode) => node.status === ResourceStatus.SUCCESS,
  },
  {
    label: "Reconciling",
    key: ResourceStatus.PENDING,
    filter: (node: TreeNode) => node.status === ResourceStatus.PENDING,
  },
  {
    label: "Unhealthy",
    key: ResourceStatus.WARNING,
    filter: (node: TreeNode) =>
      node.status === ResourceStatus.FAILED ||
      node.status === ResourceStatus.WARNING,
  },
  {
    label: "Unknown",
    key: ResourceStatus.UNKNOWN,
    filter: (node: TreeNode) => node.status === ResourceStatus.UNKNOWN,
  },
];

const suspendedFilter = [
  {
    label: "Suspended",
    key: "suspended",
    filter: (node: TreeNode) => !!node.fluxMetadata?.isSuspended,
  },
  {
    label: "Not Suspended",
    key: "resumed",
    filter: (node: TreeNode) => !node.fluxMetadata?.isSuspended,
  },
];

const AppsView: React.FC = observer(() => {
  const fluxTreeStore = useInjection(FluxTreeStore);

  const [selectedKindsToFilter, setSelectedKindsToFilter] = useState<string[]>([
    RESOURCE_TYPE.KUSTOMIZATION,
    RESOURCE_TYPE.HELM_RELEASE,
  ]);
  const [selectedStatusesToFilter, setSelectedStatusesToFilter] = useState<
    string[]
  >([]);
  const [selectedSuspendStatusesToFilter, setSelectedSuspendStatusesToFilter] =
    useState<string[]>([]);

  const onKindFilterChange = (e) => {
    const selectedKinds = e.target.value
      .split(",")
      .filter((val: string) => val !== "");
    setSelectedKindsToFilter(selectedKinds);
  };

  const onStatusFilterChange = (e) => {
    const selectedStatuses = e.target.value
      .split(",")
      .filter((val: string) => val !== "");
    setSelectedStatusesToFilter(selectedStatuses);
  };

  const onSuspendFilterChange = (e) => {
    const selectedSuspends = e.target.value
      .split(",")
      .filter((val: string) => val !== "");
    setSelectedSuspendStatusesToFilter(selectedSuspends);
  };

  const filterFunction = (node: TreeNode) => {
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

    return allFilters
      .filter((filters) => filters.length > 0)
      .map((filters) => filters.reduce((a, b) => (x) => a(x) || b(x)))
      .reduce((a, b) => (x) => a(x) && b(x))(node);
  };

  return (
    <div className="apps-view">
      <div className="flex gap-8 p-8 dark">
        <FluxControllersCard />
        <FluxApplicationsCard />
        <FluxRepositoriesCard />
        <FluxKindsCard />
      </div>
      <div className="flex gap-3 p-8 dark">
        <Select
          className="max-w-xs"
          label="Filter by kind"
          placeholder="Filter by kind"
          defaultSelectedKeys={selectedKindsToFilter}
          selectionMode="multiple"
          onChange={onKindFilterChange}
        >
          {kindsFilter.map((kind) => (
            <SelectItem key={kind.key}>{kind.label}</SelectItem>
          ))}
        </Select>
        <Select
          className="max-w-xs"
          label="Filter by status"
          placeholder="Filter by status"
          selectionMode="multiple"
          onChange={onStatusFilterChange}
        >
          {statusFilter.map((status) => (
            <SelectItem className="dark" key={status.key}>
              {status.label}
            </SelectItem>
          ))}
        </Select>
        <Select
          className="max-w-xs dark"
          label="Filter by Suspended"
          placeholder="Filter by Suspended"
          selectionMode="multiple"
          onChange={onSuspendFilterChange}
        >
          {suspendedFilter.map((suspended) => (
            <SelectItem className="dark" key={suspended.key}>
              {suspended.label}
            </SelectItem>
          ))}
        </Select>
      </div>
      <div className="flex gap-8 flex-wrap px-8">
        {[...fluxTreeStore.applications, ...fluxTreeStore.repositories]
          .filter(filterFunction)
          .map((fluxResource) => (
            <App node={fluxResource} />
          ))}
      </div>
    </div>
  );
});

export default AppsView;
