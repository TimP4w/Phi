import { describe, it, expect, vi } from "vitest";
import { ResourceServiceImpl } from "./resource.service.impl";
import type { HttpService } from "../../../http/services/http.service";

const httpMock = () => ({
  get: vi.fn(),
  getYAML: vi.fn().mockResolvedValue("yaml"),
  post: vi.fn().mockResolvedValue(undefined),
  patch: vi.fn().mockResolvedValue(undefined),
}) satisfies HttpService;

describe("ResourceServiceImpl", () => {
  it("describe fetches the YAML describe endpoint", async () => {
    const http = httpMock();
    const out = await new ResourceServiceImpl(http).describe("uid-1");
    expect(http.getYAML).toHaveBeenCalledWith("/api/resource/uid-1/describe");
    expect(out).toBe("yaml");
  });

  it("reconcile/suspend/resume PATCH the matching endpoints", async () => {
    const http = httpMock();
    const svc = new ResourceServiceImpl(http);
    await svc.reconcile("u");
    await svc.suspend("u");
    await svc.resume("u");
    expect(http.patch).toHaveBeenCalledWith("/api/resource/u/reconcile", {});
    expect(http.patch).toHaveBeenCalledWith("/api/resource/u/suspend", {});
    expect(http.patch).toHaveBeenCalledWith("/api/resource/u/resume", {});
  });
});
