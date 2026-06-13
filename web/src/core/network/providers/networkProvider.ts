import { KubeResource } from "../../fluxTree/models/tree";

// Network providers keep vendor-specific knowledge out of the generic topology
// builder, mirroring the backend's additive provider files (e.g. traefik.go).
// The builder works with provider-neutral hints from the backend (middleware
// refs, entrypoint names) and delegates anything vendor-shaped — ref formats,
// CRDs like Traefik's Middleware — to a provider. Supporting a new controller
// (nginx, Caddy, …) means adding a sibling provider; the builder is untouched.
//
// Providers hold per-build index state, so instantiate them fresh per graph
// build rather than sharing instances.
export interface NetworkProvider {
  // Index a resource if it is relevant to this provider. Called once per
  // resource during the graph build.
  index(resource: KubeResource): void;

  // Resolve a middleware/filter ref to a display name and, when known, its
  // backing resource. Return undefined when the ref is not in a format this
  // provider recognises, so the next provider (or the raw-ref fallback) applies.
  resolveMiddleware(ref: string): ResolvedMiddleware | undefined;
}

export interface ResolvedMiddleware {
  name: string;
  resource?: KubeResource;
}
