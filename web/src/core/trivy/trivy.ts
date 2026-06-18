import { KubeResource } from "../fluxTree/models/tree";

// Client-side aggregation of Trivy Operator findings. The report resources are
// already in the FluxTreeStore (streamed like any other resource); these pure
// helpers derive the per-resource index, subtree/app rollups, and cluster totals
// the widgets render. No new WebSocket channel or store is involved.

export type TrivySeverity = "critical" | "high" | "medium" | "low" | "unknown";

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

export interface TrivySummary {
  // Severity buckets kept separately for CVEs (VulnerabilityReport) and the
  // other report types (config audit / exposed secret / RBAC).
  cve: SeverityCounts;
  other: SeverityCounts;
  // Report UIDs contributing, split so the two modals fetch only what they show.
  cveReportUids: string[];
  otherReportUids: string[];
}

function emptyCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
}

export function emptyTrivySummary(): TrivySummary {
  return {
    cve: emptyCounts(),
    other: emptyCounts(),
    cveReportUids: [],
    otherReportUids: [],
  };
}

export function sumCounts(c: SeverityCounts): number {
  return c.critical + c.high + c.medium + c.low + c.unknown;
}

export function totalCves(s: TrivySummary): number {
  return sumCounts(s.cve);
}

export function totalOther(s: TrivySummary): number {
  return sumCounts(s.other);
}

export function hasFindings(s: TrivySummary): boolean {
  return totalCves(s) + totalOther(s) > 0;
}

/** Critical + high, the figure surfaced as the primary number. */
export function criticalHigh(c: SeverityCounts): number {
  return c.critical + c.high;
}

/** Everything below high (medium + low + unknown), the secondary number. */
export function lowerSeverities(c: SeverityCounts): number {
  return c.medium + c.low + c.unknown;
}

/** Worst severity present in a bucket, for icon/number coloring. */
export function worstSeverity(c: SeverityCounts): TrivySeverity | null {
  if (c.critical > 0) return "critical";
  if (c.high > 0) return "high";
  if (c.medium > 0) return "medium";
  if (c.low > 0) return "low";
  if (c.unknown > 0) return "unknown";
  return null;
}

/** Worst severity across both buckets — used for the per-node tree icon. */
export function summaryWorstSeverity(s: TrivySummary): TrivySeverity | null {
  return worstSeverity({
    critical: s.cve.critical + s.other.critical,
    high: s.cve.high + s.other.high,
    medium: s.cve.medium + s.other.medium,
    low: s.cve.low + s.other.low,
    unknown: s.cve.unknown + s.other.unknown,
  });
}

// Severity → HeroUI semantic color. critical/high are red, medium is yellow;
// low and unknown stay grey (default) — a shield only "lights up" once there is
// at least a medium finding.
export function severityColor(
  sev: TrivySeverity | null,
): "danger" | "warning" | "default" {
  switch (sev) {
    case "critical":
    case "high":
      return "danger";
    case "medium":
      return "warning";
    default:
      return "default";
  }
}

function addCounts(dst: SeverityCounts, m: KubeResource["trivyMetadata"]): void {
  if (!m) return;
  dst.critical += m.critical ?? 0;
  dst.high += m.high ?? 0;
  dst.medium += m.medium ?? 0;
  dst.low += m.low ?? 0;
  dst.unknown += m.unknown ?? 0;
}

function accumulate(dst: SeverityCounts, src: SeverityCounts): void {
  dst.critical += src.critical;
  dst.high += src.high;
  dst.medium += src.medium;
  dst.low += src.low;
  dst.unknown += src.unknown;
}

function addReport(target: TrivySummary, report: KubeResource): void {
  const m = report.trivyMetadata;
  if (!m) return;
  if (m.reportType === "vulnerability") {
    addCounts(target.cve, m);
    target.cveReportUids.push(report.uid);
  } else {
    addCounts(target.other, m);
    target.otherReportUids.push(report.uid);
  }
}

// Report→target key. Trivy's target labels carry no group, so neither can this
// key — a tolerable collision risk for the workload kinds Trivy scans.
function targetKey(kind: string, namespace: string, name: string): string {
  return `${kind}/${namespace}/${name}`;
}

/** All Trivy report resources in the store. */
export function collectReports(
  resources: Iterable<KubeResource>,
): KubeResource[] {
  const reports: KubeResource[] = [];
  for (const r of resources) {
    if (r.trivyMetadata) reports.push(r);
  }
  return reports;
}

/**
 * Index findings by the UID of the workload they target. A report names its
 * target via the trivy-operator.resource.* labels (captured in trivyMetadata);
 * we resolve that to a resource UID using a kind/namespace/name lookup.
 */
export function indexFindingsByTarget(
  resources: Iterable<KubeResource>,
): Map<string, TrivySummary> {
  const all = [...resources];
  const lookup = new Map<string, string>();
  for (const r of all) {
    lookup.set(targetKey(r.kind, r.namespace ?? "", r.name), r.uid);
  }

  const index = new Map<string, TrivySummary>();
  for (const report of collectReports(all)) {
    const m = report.trivyMetadata!;
    const uid = lookup.get(
      targetKey(m.targetKind ?? "", m.targetNamespace ?? "", m.targetName ?? ""),
    );
    if (!uid) continue; // dangling target (workload gone / not in store)
    const summary = index.get(uid) ?? emptyTrivySummary();
    addReport(summary, report);
    index.set(uid, summary);
  }
  return index;
}

/** Cluster-wide totals across every report. */
export function clusterSummary(
  resources: Iterable<KubeResource>,
): TrivySummary {
  const summary = emptyTrivySummary();
  for (const report of collectReports(resources)) addReport(summary, report);
  return summary;
}

/**
 * Sum of findings for a resource and all its descendants, using a precomputed
 * per-target index. Drives both the per-app rollup and the tree-scoped widget.
 */
export function subtreeSummary(
  root: KubeResource,
  index: Map<string, TrivySummary>,
): TrivySummary {
  const out = emptyTrivySummary();
  const visited = new Set<string>();
  const visit = (node: KubeResource) => {
    if (visited.has(node.uid)) return;
    visited.add(node.uid);
    const s = index.get(node.uid);
    if (s) {
      accumulate(out.cve, s.cve);
      accumulate(out.other, s.other);
      out.cveReportUids.push(...s.cveReportUids);
      out.otherReportUids.push(...s.otherReportUids);
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return out;
}
