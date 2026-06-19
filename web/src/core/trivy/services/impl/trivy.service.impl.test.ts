import { describe, it, expect, vi } from "vitest";
import { TrivyServiceImpl } from "./trivy.service.impl";
import type { HttpService } from "../../../http/services/http.service";

describe("TrivyServiceImpl", () => {
  it("fetches findings for a report uid", async () => {
    const findings = { vulnerabilities: [] };
    const http = {
      get: vi.fn().mockResolvedValue(findings),
      getYAML: vi.fn(), post: vi.fn(), patch: vi.fn(),
    } satisfies HttpService;

    const out = await new TrivyServiceImpl(http).getFindings("report-1");

    expect(http.get).toHaveBeenCalledWith("/api/trivy/findings/report-1");
    expect(out).toBe(findings);
  });
});
