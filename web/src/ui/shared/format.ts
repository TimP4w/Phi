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

/** used/total as a 0–100 percentage, clamped and guarded against total=0. */
export function usagePercent(used: number, total: number): number {
  return total > 0 ? Math.min(100, (used / total) * 100) : 0;
}

export type UsageColor = "danger" | "warning" | "success" | "accent";

/**
 * HeroUI color for a 0–100 usage percent: danger ≥90, warning ≥75, else `ok`
 * (the base colour, which differs per metric — e.g. accent for CPU bars).
 */
export function usageColor(pct: number, ok: UsageColor = "success"): UsageColor {
  if (pct >= 90) return "danger";
  if (pct >= 75) return "warning";
  return ok;
}

/** Last path segment of a flux revision (e.g. "main@sha1:abcdef" → "abcdef"). */
export function shortRevision(rev: string): string {
  const tail = rev.split(/[:@]/).pop() ?? rev;
  return tail.length > 12 ? tail.slice(0, 12) : tail;
}

/** Web URL for a commit, derived from a git remote (https or git@ssh form). */
export function gitCommitUrl(repoUrl: string, sha: string): string {
  const host = repoUrl
    .replace(/^https?:\/\//, "")
    .replace(/^ssh:\/\//, "")
    .replace(/^git@/, "")
    .replace(/\.git$/, "")
    .replace(":", "/");
  return `https://${host}/commit/${sha}`;
}
