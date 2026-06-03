export enum CONDITION_TYPE {
  READY = "Ready",
  HEALTHY = "Healthy",
  RELEASED = "Released",
  AVAILABLE = "Available",
  PROGRESSING = "Progressing",
  RECONCILING = "Reconciling",
  FAILED = "Failed",
  UNHEALTHY = "Unhealthy",
}

export const SUCCESS_TYPES = [CONDITION_TYPE.READY, CONDITION_TYPE.HEALTHY, CONDITION_TYPE.RELEASED, CONDITION_TYPE.AVAILABLE];
export const INFO_TYPES = [CONDITION_TYPE.PROGRESSING, CONDITION_TYPE.RECONCILING];
export const ERROR_TYPES = [CONDITION_TYPE.FAILED, CONDITION_TYPE.UNHEALTHY];

export const FAILING_REASONS = [
  "BuildFailed",
  "Failed",
  "Error",
  "Invalid",
  "HealthCheckFailed",
  "StateError",
  "UpgradeFailed",
  "ReconciliationFailed",
  "URLInvalid",
  "AuthenticationFailed",
  "VerificationError",
  "DirectoryCreationFailed",
  "StatOperationFailed",
  "ReadOperationFailed",
  "AcquireLockFailed",
  "InvalidPath",
  "ArchiveOperationFailed",
  "SymlinkUpdateFailed",
  "CacheOperationFailed",
  "PatchOperationFailed",
  "InvalidSTSConfiguration",
  "InvalidProviderConfiguration",
  "RollbackFailed",
];

export const WARNING_REASONS = [
  "ProgressingWithRetry",
  "Progressing",
  "DependencyNotReady",
  "MinimumReplicasUnavailable",
  "ContainersNotReady",
];

export const SUCCESS_REASONS = [
  "InstallSucceeded",
  "UpgradeSucceeded",
  "ChartPullSucceeded",
  "ReconciliationSucceeded",
  "Succeeded",
  "ArtifactUpToDate",
  "NewReplicaSetAvailable",
];
