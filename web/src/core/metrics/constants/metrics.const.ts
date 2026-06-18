/** Kinds that show metrics chips/tabs (spec: tree sparkline whitelist). */
export const METRICS_KINDS = new Set([
  "Pod",
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "Kustomization",
  "HelmRelease",
]);

/** Preset windows for the metrics-tab time range selector. */
export const METRICS_RANGE_PRESETS = ["15m", "1h", "6h", "24h", "3d", "7d", "14d"] as const;

/** Default detail window; matches the backend fallback. */
export const METRICS_DEFAULT_RANGE = "24h";

/**
 * Validates a manual range entry: a positive number followed by a unit
 * (m=minutes, h=hours, d=days). Returns the normalized label or null.
 */
export function normalizeRange(input: string): string | null {
  const m = input.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(m|h|d)$/);
  if (!m) return null;
  if (parseFloat(m[1]) <= 0) return null;
  return `${m[1]}${m[2]}`;
}
