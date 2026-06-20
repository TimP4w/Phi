import { describe, it, expect } from "vitest";
import {
  parseInput,
  isCompleteFilter,
  buildSuggestions,
  collectFilters,
  hasResourceFilters,
  resourceMatches,
  eventMatches,
  eligibleTargets,
  ActiveFilters,
} from "./palette";
import { kubeResource, kustomization } from "../../../test/fixtures";
import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";

const emptyFilters = (over: Partial<ActiveFilters> = {}): ActiveFilters => ({
  ns: [], uuid: [], kind: [], status: [], event: [], free: "", ...over,
});

describe("parseInput", () => {
  it("recognises a known filter prefix and keeps its value", () => {
    expect(parseInput("ns:flux")).toEqual({ kind: "filter", prefix: "ns", value: "flux" });
    expect(parseInput("KIND:Pod")).toEqual({ kind: "filter", prefix: "kind", value: "Pod" });
  });

  it("treats an unknown prefix as a free-text word", () => {
    expect(parseInput("foo:bar")).toEqual({ kind: "word", text: "foo:bar" });
  });

  it("recognises a bare command and a command with an argument", () => {
    expect(parseInput("suspend")).toEqual({ kind: "command", command: "suspend", arg: "" });
    expect(parseInput("reconcile my-app")).toEqual({ kind: "command", command: "reconcile", arg: "my-app" });
  });

  it("treats anything else as a word", () => {
    expect(parseInput("hello")).toEqual({ kind: "word", text: "hello" });
  });
});

describe("isCompleteFilter", () => {
  it("is true only for a filter with a non-empty value", () => {
    expect(isCompleteFilter("ns:flux")).toBe(true);
    expect(isCompleteFilter("ns:")).toBe(false);
    expect(isCompleteFilter("hello")).toBe(false);
  });
});

describe("buildSuggestions", () => {
  const opts = { kinds: ["Pod", "ConfigMap", "PersistentVolume"], namespaces: ["flux-system", "default"] };

  it("suggests status terms for a status filter", () => {
    const out = buildSuggestions("status:re", opts);
    expect(out.map((s) => s.completion)).toContain("status:reconciling");
  });

  it("ranks prefix matches ahead of substring matches for kinds", () => {
    const out = buildSuggestions("kind:p", opts);
    // 'Pod' and 'PersistentVolume' start with p; 'ConfigMap' only contains it.
    expect(out[0].completion).toMatch(/kind:(Pod|PersistentVolume)/);
    expect(out.map((s) => s.completion)).toContain("kind:ConfigMap");
  });

  it("suggests namespaces for an ns filter", () => {
    expect(buildSuggestions("ns:fl", opts).map((s) => s.completion)).toEqual(["ns:flux-system"]);
  });

  it("returns no value suggestions for free-form uuid/event filters", () => {
    expect(buildSuggestions("uuid:abc", opts)).toEqual([]);
  });

  it("returns nothing while a command is being typed", () => {
    expect(buildSuggestions("suspend foo", opts)).toEqual([]);
  });

  it("offers all prefixes and commands for empty or whitespace input", () => {
    const out = buildSuggestions(" ", opts);
    expect(out.some((s) => s.completion === "kind:")).toBe(true);
    expect(out.some((s) => s.completion === "suspend ")).toBe(true);
  });

  it("filters prefixes/commands by the typed word", () => {
    const out = buildSuggestions("re", opts);
    expect(out.map((s) => s.completion)).toContain("resume ");
    expect(out.map((s) => s.completion)).toContain("reconcile ");
    expect(out.some((s) => s.completion === "kind:")).toBe(false);
  });
});

describe("collectFilters / hasResourceFilters", () => {
  it("merges committed tokens with a live filter", () => {
    const f = collectFilters(
      [{ prefix: "ns", value: "flux" }],
      { kind: "filter", prefix: "kind", value: " Pod " },
    );
    expect(f.ns).toEqual(["flux"]);
    expect(f.kind).toEqual(["Pod"]);
  });

  it("captures a live word as the free term", () => {
    const f = collectFilters([], { kind: "word", text: " web " });
    expect(f.free).toBe("web");
  });

  it("reports whether any resource-scoped filter is active (ignoring event-only)", () => {
    expect(hasResourceFilters(emptyFilters())).toBe(false);
    expect(hasResourceFilters(emptyFilters({ event: ["x"] }))).toBe(false);
    expect(hasResourceFilters(emptyFilters({ kind: ["Pod"] }))).toBe(true);
  });
});

describe("resourceMatches", () => {
  const pod = kubeResource({ uid: "abc-123", kind: "Pod", name: "web", namespace: "flux-system", status: "failed" });

  it("matches namespace and uuid case-insensitively as substrings", () => {
    expect(resourceMatches(pod, emptyFilters({ ns: ["FLUX"] }))).toBe(true);
    expect(resourceMatches(pod, emptyFilters({ uuid: ["abc"] }))).toBe(true);
    expect(resourceMatches(pod, emptyFilters({ ns: ["other"] }))).toBe(false);
  });

  it("matches kind exactly (case-insensitive), not as a substring", () => {
    expect(resourceMatches(pod, emptyFilters({ kind: ["pod"] }))).toBe(true);
    expect(resourceMatches(pod, emptyFilters({ kind: ["POD"] }))).toBe(true);
    const pdb = kubeResource({ kind: "PodDisruptionBudget", name: "pdb" });
    expect(resourceMatches(pdb, emptyFilters({ kind: ["Pod"] }))).toBe(false);
  });

  it("expands a partial status term to the statuses it prefixes", () => {
    expect(resourceMatches(pod, emptyFilters({ status: ["fail"] }))).toBe(true);
    expect(resourceMatches(pod, emptyFilters({ status: ["ready"] }))).toBe(false);
  });

  it("matches a suspended flux resource by its flux flag", () => {
    const ks = kustomization({ status: "success", fluxMetadata: { isReconciling: false, isSuspended: true } });
    expect(resourceMatches(ks, emptyFilters({ status: ["suspended"] }))).toBe(true);
  });

  it("matches a reconciling flux resource by its flux flag", () => {
    const ks = kustomization({ status: "success", fluxMetadata: { isReconciling: true, isSuspended: false } });
    expect(resourceMatches(ks, emptyFilters({ status: ["reconciling"] }))).toBe(true);
  });

  it("matches free text across name/kind/namespace/uid", () => {
    expect(resourceMatches(pod, emptyFilters({ free: "web" }))).toBe(true);
    expect(resourceMatches(pod, emptyFilters({ free: "nomatch" }))).toBe(false);
  });
});

describe("eventMatches", () => {
  const event = (over: Partial<KubeEvent>): KubeEvent =>
    Object.assign(Object.create(KubeEvent.prototype), {
      uid: "e", kind: "Pod", name: "web", namespace: "flux-system",
      reason: "BackOff", message: "crash", source: "kubelet", type: "Warning",
      ...over,
    }) as KubeEvent;

  it("filters by namespace substring", () => {
    expect(eventMatches(event({}), emptyFilters({ ns: ["flux"] }))).toBe(true);
    expect(eventMatches(event({}), emptyFilters({ ns: ["other"] }))).toBe(false);
  });

  it("requires every event/free term to be present in the haystack", () => {
    expect(eventMatches(event({}), emptyFilters({ event: ["backoff"], free: "crash" }))).toBe(true);
    expect(eventMatches(event({}), emptyFilters({ event: ["backoff"], free: "missing" }))).toBe(false);
  });

  it("matches when there are no terms", () => {
    expect(eventMatches(event({}), emptyFilters())).toBe(true);
  });
});

describe("eligibleTargets", () => {
  const suspended = kustomization({ name: "s", fluxMetadata: { isReconciling: false, isSuspended: true } });
  const active = kustomization({ name: "a", fluxMetadata: { isReconciling: false, isSuspended: false } });
  const plain = kubeResource({ kind: "Pod", name: "pod" });
  const all = [suspended, active, plain];

  it("suspend targets only non-suspended flux resources", () => {
    expect(eligibleTargets("suspend", all).map((r) => r.name)).toEqual(["a"]);
  });

  it("resume targets only suspended flux resources", () => {
    expect(eligibleTargets("resume", all).map((r) => r.name)).toEqual(["s"]);
  });

  it("reconcile targets every flux resource and excludes non-flux", () => {
    expect(eligibleTargets("reconcile", all).map((r) => r.name).sort()).toEqual(["a", "s"]);
  });
});
