import "reflect-metadata";

import React, { useState } from "react";
import "./apps.scss";
import { observer } from "mobx-react-lite";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { useInjection } from "inversify-react";
import App from "../../components/app/App";
import { Link } from "react-router-dom";
import Search, { FilterCategory } from "../../components/search/Search";
import StatusCard from "../../components/status-card/statusCard";
import { useDebounce } from "use-debounce";
import { ResourceStatus, TreeNode } from "../../../core/fluxTree/models/tree";

const filterCategories: FilterCategory<TreeNode>[] = [
  {
    label: "Kinds",
    filters: [
      {
        label: "Kustomizations",
        filter: (node: TreeNode) => node.kind === "Kustomization",
      },
      {
        label: "HelmReleases",
        filter: (node: TreeNode) => node.kind === "HelmRelease",
      },
      {
        label: "HelmCharts",
        filter: (node: TreeNode) => node.kind === "HelmChart",
      },
      {
        label: "GitRepositories",
        filter: (node: TreeNode) => node.kind === "GitRepository",
      },
      {
        label: "OCIRepositories",
        filter: (node: TreeNode) => node.kind === "OCIRepository",
      },
      {
        label: "Buckets",
        filter: (node: TreeNode) => node.kind === "Bucket",
      },
    ],
  },
  {
    label: "Status",
    filters: [
      {
        label: "Healthy",
        filter: (node: TreeNode) => node.status === ResourceStatus.SUCCESS,
      },
      {
        label: "Reconciling",
        filter: (node: TreeNode) => node.status === ResourceStatus.PENDING,
      },
      {
        label: "Unhealthy",
        filter: (node: TreeNode) =>
          node.status === ResourceStatus.FAILED ||
          node.status === ResourceStatus.WARNING,
      },
      {
        label: "Unknown",
        filter: (node: TreeNode) => node.status === ResourceStatus.UNKNOWN,
      },
    ],
  },
  {
    label: "Paused",
    filters: [
      {
        label: "Suspended",
        filter: (node: TreeNode) => !!node.fluxMetadata?.isSuspended,
      },
      {
        label: "Not Suspended",
        filter: (node: TreeNode) => !node.fluxMetadata?.isSuspended,
      },
    ],
  },
];

const AppsView: React.FC = observer(() => {
  const fluxTreeStore = useInjection(FluxTreeStore);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [debouncedSearchTerm] = useDebounce(searchTerm, 50);
  const [filter, setFilter] = useState<(node: TreeNode) => boolean>(
    () => () => true
  );

  const onFilterChange = (filter: (a: never) => boolean) => {
    setFilter(() => filter as (node: TreeNode) => boolean);
  };

  return (
    <div className="apps-view">
      <div className="apps-view__system-pods">
        {fluxTreeStore.tree.getFluxSystemPods().map((node) => (
          <Link key={node.uid} to={`/tree/${node.uid}`}>
            <StatusCard key={node.uid} node={node} />
          </Link>
        ))}
      </div>

      <div className="apps-view__search-bar">
        <Search
          onChange={setSearchTerm}
          filters={filterCategories}
          onFilterChange={(filter: (a: never) => boolean) =>
            onFilterChange(filter as (node: TreeNode) => boolean)
          }
        />
      </div>
      <div className="apps-view__apps">
        {[...fluxTreeStore.applications, ...fluxTreeStore.repositories]
          .filter((k) => {
            if (debouncedSearchTerm === "") {
              return filter(k);
            }
            return (
              filter(k) &&
              (k.name
                .toLowerCase()
                .includes(debouncedSearchTerm.toLowerCase()) ||
                k.kind
                  .toLowerCase()
                  .includes(debouncedSearchTerm.toLowerCase()) ||
                k.namespace
                  ?.toLowerCase()
                  .includes(debouncedSearchTerm.toLowerCase()))
            );
          })
          .map((fluxResource) => {
            return (
              <Link key={fluxResource.uid} to={`/tree/${fluxResource.uid}`}>
                <App key={fluxResource.uid} node={fluxResource} />
              </Link>
            );
          })}
      </div>
    </div>
  );
});

export default AppsView;
