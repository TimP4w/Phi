import { FluxResource } from "../../core/fluxTree/models/tree";
import { FLUX_KINDS } from "../../core/fluxTree/constants/resources.const";
import { STATUS_BUCKETS } from "./helpers";

// Chip metadata and the matching predicate share one source of truth: the view
// renders these arrays, applicationMatchesFilter consumes them.
export const KIND_FILTERS = FLUX_KINDS.map((kind) => ({
  label: kind as string,
  key: kind as string,
  matches: (r: FluxResource) => r.kind === kind,
}));

export const STATUS_FILTERS = STATUS_BUCKETS.map((bucket) => ({
  label: bucket.label,
  key: bucket.status,
  color: bucket.color,
  matches: (r: FluxResource) => bucket.matches(r.status),
}));

export const SUSPEND_FILTERS = [
  { label: "Suspended", key: "suspended", matches: (r: FluxResource) => !!r.isSuspended },
  { label: "Active", key: "resumed", matches: (r: FluxResource) => !r.isSuspended },
];

export type ApplicationFilter = {
  search: string;
  kinds: string[];
  statuses: string[];
  suspend: string[];
};

export const EMPTY_APPLICATION_FILTER: ApplicationFilter = {
  search: "",
  kinds: [],
  statuses: [],
  suspend: [],
};

// Within a group selected options are OR-ed (empty = ignored); groups are AND-ed.
function matchesGroup(
  resource: FluxResource,
  selected: string[],
  options: { key: string; matches: (r: FluxResource) => boolean }[],
): boolean {
  if (selected.length === 0) return true;
  return options.some((o) => selected.includes(o.key) && o.matches(resource));
}

export function applicationMatchesFilter(
  resource: FluxResource,
  filter: ApplicationFilter,
): boolean {
  if (
    filter.search &&
    !resource.name.toLowerCase().includes(filter.search.toLowerCase())
  )
    return false;
  if (!matchesGroup(resource, filter.kinds, KIND_FILTERS)) return false;
  if (!matchesGroup(resource, filter.statuses, STATUS_FILTERS)) return false;
  if (!matchesGroup(resource, filter.suspend, SUSPEND_FILTERS)) return false;
  return true;
}

export function hasActiveApplicationFilter(filter: ApplicationFilter): boolean {
  return (
    filter.search.length > 0 ||
    filter.kinds.length > 0 ||
    filter.statuses.length > 0 ||
    filter.suspend.length > 0
  );
}
