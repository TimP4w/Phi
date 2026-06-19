import { describe, it, expect } from "vitest";
import {
  emptyTrivySummary,
  sumCounts,
  totalCves,
  totalOther,
  hasFindings,
  criticalHigh,
  lowerSeverities,
  worstSeverity,
  summaryWorstSeverity,
  severityColor,
  collectReports,
  indexFindingsByTarget,
  clusterSummary,
  subtreeSummary,
  TrivySummary,
} from "./trivy";
import { kubeResource, withChildren } from "../../test/fixtures";
import { TrivyMetadataDto } from "../fluxTree/models/dtos/treeDto";

const counts = (over: Partial<TrivySummary["cve"]> = {}) => ({
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  unknown: 0,
  ...over,
});

describe("severity count helpers", () => {
  it("sums every bucket", () => {
    expect(sumCounts(counts({ critical: 1, high: 2, medium: 3, low: 4, unknown: 5 }))).toBe(15);
  });

  it("separates critical+high from the lower severities", () => {
    const c = counts({ critical: 1, high: 2, medium: 3, low: 4, unknown: 5 });
    expect(criticalHigh(c)).toBe(3);
    expect(lowerSeverities(c)).toBe(12);
  });
});

describe("worstSeverity", () => {
  it("returns the highest non-zero severity in priority order", () => {
    expect(worstSeverity(counts({ low: 1, critical: 1 }))).toBe("critical");
    expect(worstSeverity(counts({ low: 1, high: 1 }))).toBe("high");
    expect(worstSeverity(counts({ low: 1, medium: 1 }))).toBe("medium");
    expect(worstSeverity(counts({ low: 1 }))).toBe("low");
    expect(worstSeverity(counts({ unknown: 1 }))).toBe("unknown");
  });

  it("returns null for an empty bucket", () => {
    expect(worstSeverity(counts())).toBeNull();
  });
});

describe("severityColor", () => {
  it("maps critical and high to danger", () => {
    expect(severityColor("critical")).toBe("danger");
    expect(severityColor("high")).toBe("danger");
  });

  it("maps medium to warning and everything else to default", () => {
    expect(severityColor("medium")).toBe("warning");
    expect(severityColor("low")).toBe("default");
    expect(severityColor("unknown")).toBe("default");
    expect(severityColor(null)).toBe("default");
  });
});

const trivyMeta = (over: Partial<TrivyMetadataDto>): TrivyMetadataDto => ({
  reportType: "vulnerability",
  ...over,
});

describe("collectReports", () => {
  it("returns only resources carrying trivy metadata", () => {
    const withReport = kubeResource({ trivyMetadata: trivyMeta({ critical: 1 }) });
    const without = kubeResource({});
    expect(collectReports([withReport, without])).toEqual([withReport]);
  });
});

describe("clusterSummary / totals / hasFindings", () => {
  it("aggregates CVE and other report types into separate buckets", () => {
    const cve = kubeResource({
      uid: "r1",
      trivyMetadata: trivyMeta({ reportType: "vulnerability", critical: 2, low: 1 }),
    });
    const audit = kubeResource({
      uid: "r2",
      trivyMetadata: trivyMeta({ reportType: "configAudit", medium: 3 }),
    });

    const s = clusterSummary([cve, audit]);

    expect(totalCves(s)).toBe(3);
    expect(totalOther(s)).toBe(3);
    expect(s.cveReportUids).toEqual(["r1"]);
    expect(s.otherReportUids).toEqual(["r2"]);
    expect(hasFindings(s)).toBe(true);
    expect(summaryWorstSeverity(s)).toBe("critical");
  });

  it("ignores reports without metadata and reports no findings when empty", () => {
    const s = clusterSummary([kubeResource({})]);
    expect(hasFindings(s)).toBe(false);
    expect(summaryWorstSeverity(s)).toBeNull();
  });

  it("treats missing severity numbers as zero", () => {
    const s = clusterSummary([
      kubeResource({ uid: "r", trivyMetadata: trivyMeta({ reportType: "configAudit" }) }),
    ]);
    expect(sumCounts(s.other)).toBe(0);
  });
});

describe("indexFindingsByTarget", () => {
  it("attaches a report to the matching workload by kind/namespace/name", () => {
    const pod = kubeResource({ uid: "pod-uid", kind: "Pod", namespace: "ns", name: "web" });
    const report = kubeResource({
      uid: "report-uid",
      kind: "VulnerabilityReport",
      trivyMetadata: trivyMeta({
        reportType: "vulnerability",
        critical: 4,
        targetKind: "Pod",
        targetNamespace: "ns",
        targetName: "web",
      }),
    });

    const index = indexFindingsByTarget([pod, report]);

    expect(index.has("pod-uid")).toBe(true);
    expect(index.get("pod-uid")!.cve.critical).toBe(4);
  });

  it("drops reports whose target workload is not in the store", () => {
    const report = kubeResource({
      uid: "report-uid",
      trivyMetadata: trivyMeta({
        targetKind: "Pod",
        targetNamespace: "gone",
        targetName: "ghost",
        critical: 1,
      }),
    });
    const index = indexFindingsByTarget([report]);
    // The report's own uid is never a key; only resolved workloads are.
    expect(index.has("report-uid")).toBe(false);
  });

  it("merges multiple reports pointing at the same workload", () => {
    const pod = kubeResource({ uid: "pod-uid", kind: "Pod", namespace: "ns", name: "web" });
    const vuln = kubeResource({
      uid: "v",
      trivyMetadata: trivyMeta({ reportType: "vulnerability", high: 2, targetKind: "Pod", targetNamespace: "ns", targetName: "web" }),
    });
    const audit = kubeResource({
      uid: "a",
      trivyMetadata: trivyMeta({ reportType: "configAudit", medium: 1, targetKind: "Pod", targetNamespace: "ns", targetName: "web" }),
    });

    const index = indexFindingsByTarget([pod, vuln, audit]);
    const s = index.get("pod-uid")!;

    expect(s.cve.high).toBe(2);
    expect(s.other.medium).toBe(1);
    expect(s.cveReportUids).toEqual(["v"]);
    expect(s.otherReportUids).toEqual(["a"]);
  });
});

describe("subtreeSummary", () => {
  it("rolls up findings for a node and its descendants", () => {
    const child = kubeResource({ uid: "child" });
    const root = withChildren(kubeResource({ uid: "root" }), [child]);
    const index = new Map<string, TrivySummary>([
      ["root", { ...emptyTrivySummary(), cve: counts({ critical: 1 }), cveReportUids: ["r-root"] }],
      ["child", { ...emptyTrivySummary(), other: counts({ medium: 2 }), otherReportUids: ["r-child"] }],
    ]);

    const s = subtreeSummary(root, index);

    expect(s.cve.critical).toBe(1);
    expect(s.other.medium).toBe(2);
    expect(s.cveReportUids).toEqual(["r-root"]);
    expect(s.otherReportUids).toEqual(["r-child"]);
  });

  it("visits a shared node reachable by two paths only once", () => {
    const shared = kubeResource({ uid: "shared" });
    const root = withChildren(kubeResource({ uid: "root" }), [
      shared,
      withChildren(kubeResource({ uid: "mid" }), [shared]),
    ]);
    const index = new Map<string, TrivySummary>([
      ["shared", { ...emptyTrivySummary(), cve: counts({ high: 5 }) }],
    ]);

    expect(subtreeSummary(root, index).cve.high).toBe(5);
  });

  it("contributes nothing for nodes absent from the index", () => {
    const root = kubeResource({ uid: "root" });
    expect(hasFindings(subtreeSummary(root, new Map()))).toBe(false);
  });
});
