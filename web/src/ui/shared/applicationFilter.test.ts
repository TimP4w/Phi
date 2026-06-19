import { describe, it, expect } from "vitest";
import {
  EMPTY_APPLICATION_FILTER,
  applicationMatchesFilter,
  hasActiveApplicationFilter,
} from "./applicationFilter";
import { ResourceStatus } from "../../core/fluxTree/models/tree";
import { kustomization, helmRelease } from "../../test/fixtures";

describe("applicationMatchesFilter", () => {
  it("matches everything when the filter is empty", () => {
    const r = kustomization({ name: "web", status: "success" });
    expect(applicationMatchesFilter(r, EMPTY_APPLICATION_FILTER)).toBe(true);
  });

  it("filters by name search, case-insensitively", () => {
    const r = kustomization({ name: "Frontend" });
    expect(applicationMatchesFilter(r, { ...EMPTY_APPLICATION_FILTER, search: "front" })).toBe(true);
    expect(applicationMatchesFilter(r, { ...EMPTY_APPLICATION_FILTER, search: "backend" })).toBe(false);
  });

  it("filters by kind", () => {
    const k = kustomization({});
    expect(applicationMatchesFilter(k, { ...EMPTY_APPLICATION_FILTER, kinds: ["Kustomization"] })).toBe(true);
    expect(applicationMatchesFilter(k, { ...EMPTY_APPLICATION_FILTER, kinds: ["HelmRelease"] })).toBe(false);
  });

  it("filters by status bucket", () => {
    const failed = helmRelease({ status: "failed" });
    expect(applicationMatchesFilter(failed, { ...EMPTY_APPLICATION_FILTER, statuses: [ResourceStatus.FAILED] })).toBe(true);
    expect(applicationMatchesFilter(failed, { ...EMPTY_APPLICATION_FILTER, statuses: [ResourceStatus.SUCCESS] })).toBe(false);
  });

  it("filters by suspended state", () => {
    const suspended = kustomization({ fluxMetadata: { isSuspended: true } });
    expect(applicationMatchesFilter(suspended, { ...EMPTY_APPLICATION_FILTER, suspend: ["suspended"] })).toBe(true);
    expect(applicationMatchesFilter(suspended, { ...EMPTY_APPLICATION_FILTER, suspend: ["resumed"] })).toBe(false);
  });

  it("ANDs groups together", () => {
    const r = kustomization({ name: "web", status: "success" });
    expect(
      applicationMatchesFilter(r, {
        search: "web",
        kinds: ["Kustomization"],
        statuses: [ResourceStatus.SUCCESS],
        suspend: [],
      }),
    ).toBe(true);
    expect(
      applicationMatchesFilter(r, {
        search: "web",
        kinds: ["HelmRelease"],
        statuses: [ResourceStatus.SUCCESS],
        suspend: [],
      }),
    ).toBe(false);
  });
});

describe("hasActiveApplicationFilter", () => {
  it("is false for the empty filter and true once any group is set", () => {
    expect(hasActiveApplicationFilter(EMPTY_APPLICATION_FILTER)).toBe(false);
    expect(hasActiveApplicationFilter({ ...EMPTY_APPLICATION_FILTER, search: "x" })).toBe(true);
    expect(hasActiveApplicationFilter({ ...EMPTY_APPLICATION_FILTER, kinds: ["Kustomization"] })).toBe(true);
  });
});
