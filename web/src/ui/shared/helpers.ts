import { Condition, ResourceStatus } from "../../core/fluxTree/models/tree";
import {
  CONDITION_TYPE,
  ERROR_TYPES,
  SUCCESS_TYPES,
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

export const colorByEventStatus = (status: 'Normal' | 'Warning') => {
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
    case ResourceStatus.SUCCESS: return "bg-success";
    case ResourceStatus.FAILED: return "bg-danger";
    case ResourceStatus.PENDING: return "bg-primary";
    case ResourceStatus.WARNING: return "bg-warning";
    default: return "bg-default-400";
  }
};

// HeroUI semantic color for a status (chips, etc.).
export const statusChipColor = (
  status: ResourceStatus,
): "danger" | "warning" | "success" | "default" => {
  switch (status) {
    case ResourceStatus.FAILED: return "danger";
    case ResourceStatus.WARNING:
    case ResourceStatus.PENDING: return "warning";
    case ResourceStatus.SUCCESS: return "success";
    default: return "default";
  }
};

// Dot color for a single resource condition, derived from its type then reason.
export const conditionDotClass = (condition: Condition): string => {
  const conditionType = isEnumValue(CONDITION_TYPE, condition.type)
    ? condition.type
    : undefined;
  if (conditionType && SUCCESS_TYPES.includes(conditionType)) {
    return condition.status ? "bg-success" : "bg-danger";
  }
  if (conditionType && ERROR_TYPES.includes(conditionType)) return "bg-danger";

  const failing = [
    "BuildFailed", "Failed", "Error", "Invalid", "HealthCheckFailed",
    "UpgradeFailed", "ReconciliationFailed", "AuthenticationFailed",
    "RollbackFailed", "URLInvalid", "VerificationError",
  ];
  if (failing.includes(condition.reason)) return "bg-danger";

  const warning = [
    "ProgressingWithRetry", "Progressing", "DependencyNotReady",
    "ContainersNotReady", "MinimumReplicasUnavailable",
  ];
  if (warning.includes(condition.reason)) return "bg-warning";

  const success = [
    "InstallSucceeded", "UpgradeSucceeded", "ReconciliationSucceeded",
    "Succeeded", "ArtifactUpToDate", "ChartPullSucceeded", "NewReplicaSetAvailable",
  ];
  if (success.includes(condition.reason)) return "bg-success";

  return "bg-default-400";
};
