/** 0.35 -> "350m", 2.1 -> "2.10" (cores) */
export function formatCores(v: number): string {
  if (v < 1) return `${Math.round(v * 1000)}m`;
  return v.toFixed(2);
}

const UNITS = ["B", "Ki", "Mi", "Gi", "Ti"];

export function formatBytes(v: number): string {
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)}${UNITS[i]}`;
}
