import { ResourceStatus } from "../../core/fluxTree/models/tree";

export const colorByStatus = (status: ResourceStatus) => {
  switch (status) {
    case ResourceStatus.SUCCESS:
      return "success";
    case ResourceStatus.FAILED:
      return "danger";
    case ResourceStatus.PENDING:
      return "warning";
    default:
      return "primary";
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
    default:
      return "Unknown";
  }
};
