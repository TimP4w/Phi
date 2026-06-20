import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import TrivyFindingsModal, { severityChipColor, findingLink, toRow } from "./TrivyFindingsModal";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { TYPES } from "../../../core/shared/types";
import { TrivyFindings } from "../../../core/trivy/models/trivyFindings";

describe("severityChipColor", () => {
  it("maps severities to chip colours", () => {
    expect(severityChipColor("CRITICAL")).toBe("danger");
    expect(severityChipColor("high")).toBe("danger");
    expect(severityChipColor("Medium")).toBe("warning");
    expect(severityChipColor("LOW")).toBe("warning");
    expect(severityChipColor("UNKNOWN")).toBe("default");
  });
});

describe("findingLink", () => {
  it("builds an Aqua NVD url for a CVE id", () => {
    expect(findingLink({}, "CVE-2005-2347")).toBe("https://avd.aquasec.com/nvd/2005/cve-2005-2347/");
  });

  it("builds a GitHub advisory url for a GHSA id", () => {
    expect(findingLink({}, "ghsa-xxxx-yyyy-zzzz")).toBe("https://github.com/advisories/GHSA-XXXX-YYYY-ZZZZ");
  });

  it("builds an Aqua misconfig url for KSV/KCV/AVD ids", () => {
    expect(findingLink({}, "KSV001")).toBe("https://avd.aquasec.com/misconfig/ksv001");
  });

  it("falls back to the embedded primaryLink, then links array", () => {
    expect(findingLink({ primaryLink: "https://x" }, "OTHER")).toBe("https://x");
    expect(findingLink({ links: ["https://y"] }, "OTHER")).toBe("https://y");
    expect(findingLink({}, "OTHER")).toBeUndefined();
  });
});

describe("toRow", () => {
  const target = { targetKind: "Deployment", targetName: "web", targetNamespace: "ns" };

  it("flattens a vulnerability item", () => {
    const findings: TrivyFindings = { reportType: "vulnerability", target, items: [] };
    const row = toRow(findings, { vulnerabilityID: "CVE-2020-0001", resource: "openssl", severity: "HIGH", title: "bug", installedVersion: "1.0", fixedVersion: "1.1" }, 0, "uid-1");
    expect(row.severity).toBe("HIGH");
    expect(row.title).toBe("CVE-2020-0001 — openssl");
    expect(row.detail).toContain("installed 1.0");
    expect(row.detail).toContain("fixed in 1.1");
    expect(row.targetLabel).toBe("Deployment/web");
    expect(row.targetUid).toBe("uid-1");
  });

  it("flattens a config-audit item using checks", () => {
    const findings: TrivyFindings = { reportType: "configAudit", target, items: [] };
    const row = toRow(findings, { checkID: "KSV001", title: "no root", severity: "MEDIUM", description: "run as non-root" }, 2);
    expect(row.title).toBe("no root");
    expect(row.detail).toBe("run as non-root");
    expect(row.link).toContain("misconfig/ksv001");
  });
});

describe("TrivyFindingsModal", () => {
  const findings: TrivyFindings = {
    reportType: "vulnerability",
    target: { targetKind: "Deployment", targetName: "web", targetNamespace: "ns" },
    items: [
      { vulnerabilityID: "CVE-2020-0001", resource: "openssl", severity: "CRITICAL", title: "rce" },
      { vulnerabilityID: "CVE-2020-0002", resource: "curl", severity: "LOW", title: "minor" },
    ],
  };

  const containerWithService = (impl = vi.fn().mockResolvedValue(findings)) => {
    const c = makeTestContainer();
    c.rebind(TYPES.GetTrivyFindingsUseCase).toConstantValue({ execute: impl });
    return c;
  };

  it("renders an empty state when there are no report uids", () => {
    renderWithProviders(<TrivyFindingsModal isOpen onOpenChange={() => {}} title="CVEs" reportUids={[]} />);
    expect(screen.getByText("No findings.")).toBeInTheDocument();
  });

  it("fetches reports and shows the finding count in the header", async () => {
    renderWithProviders(<TrivyFindingsModal isOpen onOpenChange={() => {}} title="CVEs" reportUids={["r1"]} />, { container: containerWithService() });
    await waitFor(() => expect(screen.getByText("(2)")).toBeInTheDocument());
  });

  it("seeds the severity filter from initialSeverity", async () => {
    renderWithProviders(<TrivyFindingsModal isOpen onOpenChange={() => {}} title="CVEs" reportUids={["r1"]} initialSeverity="critical" />, { container: containerWithService() });
    // Only the CRITICAL finding passes the seeded filter (1 of 2).
    await waitFor(() => expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument());
  });
});
