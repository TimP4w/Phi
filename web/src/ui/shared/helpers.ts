import { ResourceStatus } from "../../core/fluxTree/models/tree";

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
