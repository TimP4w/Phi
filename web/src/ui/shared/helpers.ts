import { Condition, ResourceStatus } from "../../core/fluxTree/models/tree";
import {
  CONDITION_TYPE,
  ERROR_TYPES,
  SUCCESS_TYPES,
  FAILING_REASONS,
  WARNING_REASONS,
  SUCCESS_REASONS,
} from "../../core/fluxTree/constants/conditions.const";
import { isEnumValue } from "../../core/shared/enum.utils";

export type StatusColor = "success" | "danger" | "warning" | "default";

// Single source of truth for how a ResourceStatus is presented; every status
// helper below derives from it. dotClass/textClass are complete Tailwind class
// strings (never interpolated) so the JIT can see them.
type StatusPresentation = {
  color: StatusColor;
  text: string;
  dotClass: string;
  textClass: string;
};

const STATUS_PRESENTATION: Record<ResourceStatus, StatusPresentation> = {
  [ResourceStatus.SUCCESS]: { color: "success", text: "Ready", dotClass: "bg-success", textClass: "text-success" },
  [ResourceStatus.FAILED]: { color: "danger", text: "Not Ready", dotClass: "bg-danger", textClass: "text-danger" },
  [ResourceStatus.PENDING]: { color: "warning", text: "Reconciling", dotClass: "bg-warning", textClass: "text-warning" },
  [ResourceStatus.WARNING]: { color: "warning", text: "Reconciling", dotClass: "bg-warning", textClass: "text-warning" },
  [ResourceStatus.SUSPENDED]: { color: "default", text: "Suspended", dotClass: "bg-default-400", textClass: "text-default-400" },
  [ResourceStatus.UNKNOWN]: { color: "default", text: "Unknown", dotClass: "bg-default-400", textClass: "text-default-400" },
};

const presentationFor = (status: ResourceStatus): StatusPresentation =>
  STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION[ResourceStatus.UNKNOWN];

// HeroUI semantic color for a status (chips, etc.).
export const colorByStatus = (status: ResourceStatus): StatusColor => presentationFor(status).color;

// Alias kept for call sites that read more naturally as a "chip color".
export const statusChipColor = colorByStatus;

export const statusText = (status: ResourceStatus): string => presentationFor(status).text;

// Tailwind bg-* class for a status dot.
export const statusDotClass = (status: ResourceStatus): string => presentationFor(status).dotClass;

export const colorByEventStatus = (status: "Normal" | "Warning") => {
  switch (status) {
    case "Normal":
      return "primary";
    case "Warning":
      return "warning";
    default:
      return "primary";
  }
};

// Coarse status grouping for the dashboard filters and Applications widget;
// "Not Ready" intentionally folds in WARNING. Presentation comes from
// STATUS_PRESENTATION via each bucket's representative status.
export type StatusBucket = {
  label: string;
  status: ResourceStatus;
  color: StatusColor;
  dotClass: string;
  textClass: string;
  matches: (status: ResourceStatus) => boolean;
};

const BUCKET_DEFINITIONS: Pick<StatusBucket, "label" | "status" | "matches">[] = [
  { label: "Ready", status: ResourceStatus.SUCCESS, matches: (s) => s === ResourceStatus.SUCCESS },
  {
    label: "Not Ready",
    status: ResourceStatus.FAILED,
    matches: (s) => s === ResourceStatus.FAILED || s === ResourceStatus.WARNING,
  },
  { label: "Reconciling", status: ResourceStatus.PENDING, matches: (s) => s === ResourceStatus.PENDING },
  { label: "Suspended", status: ResourceStatus.SUSPENDED, matches: (s) => s === ResourceStatus.SUSPENDED },
];

export const STATUS_BUCKETS: StatusBucket[] = BUCKET_DEFINITIONS.map((def) => {
  const { color, dotClass, textClass } = presentationFor(def.status);
  return { ...def, color, dotClass, textClass };
});

// Dot color for a single resource condition, derived from its type then reason.
export const conditionDotClass = (condition: Condition): string => {
  const conditionType = isEnumValue(CONDITION_TYPE, condition.type)
    ? condition.type
    : undefined;
  if (conditionType && SUCCESS_TYPES.includes(conditionType)) {
    return condition.status ? "bg-success" : "bg-danger";
  }
  if (conditionType && ERROR_TYPES.includes(conditionType)) return "bg-danger";

  if (FAILING_REASONS.includes(condition.reason)) return "bg-danger";
  if (WARNING_REASONS.includes(condition.reason)) return "bg-warning";
  if (SUCCESS_REASONS.includes(condition.reason)) return "bg-success";

  return "bg-default-400";
};
