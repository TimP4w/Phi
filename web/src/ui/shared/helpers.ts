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

export const colorByStatus = (status: ResourceStatus) => {
  switch (status) {
    case ResourceStatus.SUCCESS:
      return "success";
    case ResourceStatus.FAILED:
      return "danger";
    case ResourceStatus.PENDING:
      return "primary";
    case ResourceStatus.WARNING:
      return "warning";
    case ResourceStatus.SUSPENDED:
      return "default";
    default:
      return "default";
  }
};

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

export const statusText = (status: ResourceStatus) => {
  switch (status) {
    case ResourceStatus.SUCCESS:
      return "Ready";
    case ResourceStatus.FAILED:
      return "Not Ready";
    case ResourceStatus.PENDING:
      return "Reconciling";
    case ResourceStatus.WARNING:
      return "Reconciling";
    case ResourceStatus.SUSPENDED:
      return "Suspended";
    default:
      return "Unknown";
  }
};

// Tailwind bg-* class for a status dot.
export const statusDotClass = (status: ResourceStatus): string => {
  switch (status) {
    case ResourceStatus.SUCCESS:
      return "bg-success";
    case ResourceStatus.FAILED:
      return "bg-danger";
    case ResourceStatus.PENDING:
      return "bg-primary";
    case ResourceStatus.WARNING:
      return "bg-warning";
    default:
      return "bg-default-400";
  }
};

// HeroUI semantic color for a status (chips, etc.).
export const statusChipColor = (
  status: ResourceStatus,
): "danger" | "warning" | "success" | "default" => {
  switch (status) {
    case ResourceStatus.FAILED:
      return "danger";
    case ResourceStatus.WARNING:
    case ResourceStatus.PENDING:
      return "warning";
    case ResourceStatus.SUCCESS:
      return "success";
    default:
      return "default";
  }
};

// A coarse status "bucket" used by the dashboard filters and the Applications
// widget: it groups the fine-grained ResourceStatus values into the four buckets
// the UI presents (Ready / Not Ready / Reconciling / Suspended), with the chip
// color and the matching predicate. Single source of truth so the dashboard and
// the widget can't drift apart.
//
// dotClass/textClass are spelled out as complete Tailwind class strings (never
// interpolated) so the JIT can see them; "default" uses the muted -400 shade for
// dots/text while `color` stays the bare semantic name for HeroUI's Chip prop.
export type StatusBucket = {
  label: string;
  status: ResourceStatus;
  color: "success" | "danger" | "warning" | "default";
  dotClass: string;
  textClass: string;
  matches: (status: ResourceStatus) => boolean;
};

export const STATUS_BUCKETS: StatusBucket[] = [
  {
    label: "Ready",
    status: ResourceStatus.SUCCESS,
    color: "success",
    dotClass: "bg-success",
    textClass: "text-success",
    matches: (s) => s === ResourceStatus.SUCCESS,
  },
  {
    label: "Not Ready",
    status: ResourceStatus.FAILED,
    color: "danger",
    dotClass: "bg-danger",
    textClass: "text-danger",
    matches: (s) => s === ResourceStatus.FAILED || s === ResourceStatus.WARNING,
  },
  {
    label: "Reconciling",
    status: ResourceStatus.PENDING,
    color: "warning",
    dotClass: "bg-warning",
    textClass: "text-warning",
    matches: (s) => s === ResourceStatus.PENDING,
  },
  {
    label: "Suspended",
    status: ResourceStatus.SUSPENDED,
    color: "default",
    dotClass: "bg-default-400",
    textClass: "text-default-400",
    matches: (s) => s === ResourceStatus.SUSPENDED,
  },
];

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
