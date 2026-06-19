import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpServiceImpl } from "./http.service.impl";

const makeResponse = (
  body: unknown,
  { ok = true, status = 200, statusText = "OK", contentType = "application/json", contentLength }: Partial<{
    ok: boolean; status: number; statusText: string; contentType: string | null; contentLength: string | null;
  }> = {},
): Response => {
  const headers = new Map<string, string>();
  if (contentType !== null) headers.set("Content-Type", contentType);
  if (contentLength != null) headers.set("Content-Length", contentLength);
  return {
    ok, status, statusText,
    headers: { get: (k: string) => headers.get(k) ?? null },
    json: async () => body,
    text: async () => String(body),
  } as unknown as Response;
};

describe("HttpServiceImpl", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  describe("get", () => {
    it("returns parsed JSON on success", async () => {
      fetchMock.mockResolvedValue(makeResponse({ a: 1 }));
      await expect(new HttpServiceImpl().get("/api/x")).resolves.toEqual({ a: 1 });
    });

    it("throws on a non-ok response", async () => {
      fetchMock.mockResolvedValue(makeResponse(null, { ok: false, status: 500, statusText: "Err" }));
      await expect(new HttpServiceImpl().get("/api/x")).rejects.toThrow(/HTTP 500/);
    });
  });

  describe("getYAML", () => {
    it("returns text when the content type is YAML", async () => {
      fetchMock.mockResolvedValue(makeResponse("a: b", { contentType: "application/x-yaml" }));
      await expect(new HttpServiceImpl().getYAML("/api/y")).resolves.toBe("a: b");
    });

    it("throws when the content type is not YAML", async () => {
      fetchMock.mockResolvedValue(makeResponse("{}", { contentType: "application/json" }));
      await expect(new HttpServiceImpl().getYAML("/api/y")).rejects.toThrow(/Expected YAML/);
    });

    it("throws on a non-ok response", async () => {
      fetchMock.mockResolvedValue(makeResponse(null, { ok: false, status: 404, statusText: "NF" }));
      await expect(new HttpServiceImpl().getYAML("/api/y")).rejects.toThrow(/HTTP 404/);
    });
  });

  describe("post", () => {
    it("sends a JSON body and parses the JSON response", async () => {
      fetchMock.mockResolvedValue(makeResponse({ ok: true }));
      const out = await new HttpServiceImpl().post("/api/p", { x: 1 });
      expect(out).toEqual({ ok: true });
      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify({ x: 1 }));
    });

    it("returns undefined for a 204 empty body", async () => {
      fetchMock.mockResolvedValue(makeResponse(null, { status: 204 }));
      await expect(new HttpServiceImpl().post("/api/p", {})).resolves.toBeUndefined();
    });

    it("returns undefined for a non-JSON response", async () => {
      fetchMock.mockResolvedValue(makeResponse("text", { contentType: "text/plain" }));
      await expect(new HttpServiceImpl().post("/api/p", {})).resolves.toBeUndefined();
    });

    it("throws on a non-ok response", async () => {
      fetchMock.mockResolvedValue(makeResponse(null, { ok: false, status: 400, statusText: "Bad" }));
      await expect(new HttpServiceImpl().post("/api/p", {})).rejects.toThrow(/HTTP 400/);
    });
  });

  describe("patch", () => {
    it("sends a PATCH and returns undefined when Content-Length is 0", async () => {
      fetchMock.mockResolvedValue(makeResponse(null, { contentLength: "0" }));
      const out = await new HttpServiceImpl().patch("/api/r", {});
      expect(out).toBeUndefined();
      expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    });

    it("throws on a non-ok response", async () => {
      fetchMock.mockResolvedValue(makeResponse(null, { ok: false, status: 409, statusText: "Conflict" }));
      await expect(new HttpServiceImpl().patch("/api/r", {})).rejects.toThrow(/HTTP 409/);
    });
  });
});
