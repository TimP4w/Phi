import {
  KubeResource,
  FluxResource,
  ResourceStatus,
} from "../../../core/fluxTree/models/tree";
import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";

/* Search prefixes recognised by the palette. `prefix:value` tokens filter the
 * resource (or event) result set. */
export const FILTER_PREFIXES = ["ns", "uuid", "kind", "status", "event"] as const;
export type FilterPrefix = (typeof FILTER_PREFIXES)[number];

/* Action commands. These operate on a single flux resource picked from the
 * result list rather than filtering. */
export const COMMANDS = ["suspend", "resume", "reconcile"] as const;
export type CommandName = (typeof COMMANDS)[number];

/* Status terms exposed to the user, mapped onto the internal ResourceStatus /
 * flux flags by statusMatchesResource. */
export const STATUS_TERMS = [
  "ready",
  "failed",
  "reconciling",
  "suspended",
  "warning",
] as const;
export type StatusTerm = (typeof STATUS_TERMS)[number];

export const PREFIX_HINTS: Record<FilterPrefix, string> = {
  ns: "filter by namespace",
  uuid: "filter by uuid",
  kind: "filter by kind",
  status: "filter by status",
  event: "search events",
};

export const COMMAND_HINTS: Record<CommandName, string> = {
  suspend: "suspend a resource",
  resume: "resume a resource",
  reconcile: "reconcile a resource",
};

/** A committed search filter, rendered as a pill. */
export type FilterToken = { prefix: FilterPrefix; value: string };

/** The result of interpreting the live (un-pilled) input text. */
export type ParsedInput =
  | { kind: "filter"; prefix: FilterPrefix; value: string }
  | { kind: "command"; command: CommandName; arg: string }
  | { kind: "word"; text: string };

const PREFIX_RE = /^([a-zA-Z]+):(.*)$/s;

const isFilterPrefix = (p: string): p is FilterPrefix =>
  (FILTER_PREFIXES as readonly string[]).includes(p);

export function parseInput(input: string): ParsedInput {
  const m = input.match(PREFIX_RE);
  if (m) {
    const prefix = m[1].toLowerCase();
    if (isFilterPrefix(prefix)) {
      return { kind: "filter", prefix, value: m[2] };
    }
    // Unknown prefix — treat the whole thing as a free-text search term.
    return { kind: "word", text: input };
  }

  const lower = input.toLowerCase();
  for (const c of COMMANDS) {
    if (lower === c) return { kind: "command", command: c, arg: "" };
    if (lower.startsWith(c + " ")) {
      return { kind: "command", command: c, arg: input.slice(c.length + 1).trimStart() };
    }
  }

  return { kind: "word", text: input };
}

/** True when the input is a complete `prefix:value` filter ready to be pilled
 * (used to turn input into a pill on space). */
export function isCompleteFilter(input: string): boolean {
  const parsed = parseInput(input);
  return parsed.kind === "filter" && parsed.value.trim().length > 0;
}

/* ---------------------------------------------------------------------- */
/* Autocomplete suggestions                                               */
/* ---------------------------------------------------------------------- */

export type Suggestion = {
  /** Display label. */
  label: string;
  /** What the input becomes when the suggestion is applied. */
  completion: string;
  /** Right-aligned hint text. */
  hint?: string;
};

export function buildSuggestions(
  input: string,
  opts: { kinds: string[]; namespaces: string[] }
): Suggestion[] {
  const parsed = parseInput(input);

  // Completing the value part of a `prefix:` filter.
  if (parsed.kind === "filter") {
    const v = parsed.value.toLowerCase();
    let values: readonly string[] = [];
    if (parsed.prefix === "status") values = STATUS_TERMS;
    else if (parsed.prefix === "kind") values = opts.kinds;
    else if (parsed.prefix === "ns") values = opts.namespaces;
    // uuid / event take free-form values — no suggestions.

    return values
      .filter((x) => x.toLowerCase().includes(v))
      // Rank prefix matches first (so `kind:p` surfaces Pod before, say,
      // ConfigMap), then alphabetically. Without this the alphabetical cap
      // could hide common kinds like Pod behind a wall of earlier letters.
      .sort((a, b) => {
        const sa = a.toLowerCase().startsWith(v) ? 0 : 1;
        const sb = b.toLowerCase().startsWith(v) ? 0 : 1;
        return sa - sb || a.localeCompare(b);
      })
      .slice(0, 10)
      .map((x) => ({
        label: `${parsed.prefix}:${x}`,
        completion: `${parsed.prefix}:${x}`,
      }));
  }

  // A command is already being typed — its targets show up as results.
  if (parsed.kind === "command") return [];

  // Otherwise suggest prefixes and commands that match the typed word.
  // Trim leading whitespace so a stray/first space behaves like empty input
  // (shows the full hint menu) rather than matching nothing.
  const w = input.trimStart().toLowerCase();
  const out: Suggestion[] = [];
  for (const p of FILTER_PREFIXES) {
    if (`${p}:`.startsWith(w) || w === "") {
      out.push({ label: `${p}:`, completion: `${p}:`, hint: PREFIX_HINTS[p] });
    }
  }
  for (const c of COMMANDS) {
    if (c.startsWith(w)) {
      out.push({ label: c, completion: `${c} `, hint: COMMAND_HINTS[c] });
    }
  }
  return out;
}

/* ---------------------------------------------------------------------- */
/* Filtering                                                              */
/* ---------------------------------------------------------------------- */

export type ActiveFilters = {
  ns: string[];
  uuid: string[];
  kind: string[];
  status: string[];
  event: string[];
  free: string;
};

/** Merge committed tokens with the live input into a single filter set. */
export function collectFilters(
  tokens: FilterToken[],
  parsed: ParsedInput
): ActiveFilters {
  const f: ActiveFilters = { ns: [], uuid: [], kind: [], status: [], event: [], free: "" };
  for (const t of tokens) f[t.prefix].push(t.value);

  if (parsed.kind === "filter" && parsed.value.trim()) {
    f[parsed.prefix].push(parsed.value.trim());
  } else if (parsed.kind === "word" && parsed.text.trim()) {
    f.free = parsed.text.trim();
  }
  return f;
}

export function hasResourceFilters(f: ActiveFilters): boolean {
  return (
    f.ns.length > 0 ||
    f.uuid.length > 0 ||
    f.kind.length > 0 ||
    f.status.length > 0 ||
    f.free.length > 0
  );
}

function statusMatchesResource(r: KubeResource, term: StatusTerm): boolean {
  const flux = r as Partial<FluxResource>;
  switch (term) {
    case "ready":
      return r.status === ResourceStatus.SUCCESS;
    case "failed":
      return r.status === ResourceStatus.FAILED;
    case "warning":
      return r.status === ResourceStatus.WARNING;
    case "suspended":
      return r.status === ResourceStatus.SUSPENDED || flux.isSuspended === true;
    case "reconciling":
      return r.status === ResourceStatus.PENDING || flux.isReconciling === true;
  }
}

export function resourceMatches(r: KubeResource, f: ActiveFilters): boolean {
  const includesAny = (haystack: string, needles: string[]) =>
    needles.some((n) => haystack.toLowerCase().includes(n.toLowerCase()));

  if (f.ns.length && !includesAny(r.namespace ?? "", f.ns)) return false;
  if (f.uuid.length && !includesAny(r.uid, f.uuid)) return false;
  if (f.kind.length && !includesAny(r.kind, f.kind)) return false;

  if (f.status.length) {
    const ok = f.status.some((raw) => {
      const v = raw.toLowerCase();
      // Expand a (possibly partial) term to the status terms it prefixes.
      const terms = STATUS_TERMS.filter((t) => t === v || t.startsWith(v));
      return terms.some((t) => statusMatchesResource(r, t));
    });
    if (!ok) return false;
  }

  if (f.free) {
    const q = f.free.toLowerCase();
    const hay = `${r.name} ${r.kind} ${r.namespace ?? ""} ${r.uid}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  return true;
}

export function eventMatches(e: KubeEvent, f: ActiveFilters): boolean {
  if (f.ns.length && !f.ns.some((n) => (e.namespace ?? "").toLowerCase().includes(n.toLowerCase())))
    return false;

  const terms = [...f.event, f.free].filter((t) => t.trim().length > 0);
  if (terms.length) {
    const hay = `${e.reason} ${e.message} ${e.name} ${e.namespace} ${e.kind} ${e.source}`.toLowerCase();
    if (!terms.every((t) => hay.includes(t.toLowerCase()))) return false;
  }
  return true;
}

/** Flux resources eligible for a given command, before name filtering. */
export function eligibleTargets(
  command: CommandName,
  resources: KubeResource[]
): FluxResource[] {
  const flux = resources.filter((r): r is FluxResource => r instanceof FluxResource);
  if (command === "suspend") return flux.filter((r) => !r.isSuspended);
  if (command === "resume") return flux.filter((r) => r.isSuspended);
  return flux; // reconcile — any flux resource
}
