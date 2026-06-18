import { Container } from "../../../core/fluxTree/models/tree";
import { isContainerErrorReason } from "../../../core/fluxTree/constants/conditions.const";

export const containerStateColor = (
  c: Container
): "success" | "danger" | "warning" | "default" => {
  if (isContainerErrorReason(c.reason)) return "danger";
  if (c.state === "Terminated" && (c.exitCode ?? 0) !== 0) return "danger";
  if (c.state === "Running" && c.ready) return "success";
  if (c.state === "Waiting") return "warning";
  return "default";
};
