import { describe, it, expect } from "vitest";
import { TraefikProvider } from "./traefik.provider";
import { kubeResource } from "../../../test/fixtures";

const middleware = (namespace: string, name: string) =>
  kubeResource({ kind: "Middleware", namespace, name });

describe("TraefikProvider", () => {
  it("ignores resources that are not Middlewares", () => {
    const p = new TraefikProvider();
    p.index(kubeResource({ kind: "Service", namespace: "ns", name: "svc" }));
    expect(p.resolveMiddleware("ns/svc")).toEqual({ name: "svc", resource: undefined });
  });

  it("resolves a canonical namespace/name ref to the indexed middleware", () => {
    const p = new TraefikProvider();
    const mw = middleware("ns", "auth");
    p.index(mw);
    expect(p.resolveMiddleware("ns/auth")).toEqual({ name: "auth", resource: mw });
  });

  it("resolves a provider token ref (namespace-name@provider)", () => {
    const p = new TraefikProvider();
    const mw = middleware("ns", "auth");
    p.index(mw);
    expect(p.resolveMiddleware("ns-auth@kubernetescrd")).toEqual({ name: "auth", resource: mw });
  });

  it("falls back to the token name when the token is unknown", () => {
    const p = new TraefikProvider();
    expect(p.resolveMiddleware("ns-unknown@file")).toEqual({ name: "ns-unknown", resource: undefined });
  });

  it("falls back to the last path segment for an unknown canonical ref", () => {
    const p = new TraefikProvider();
    expect(p.resolveMiddleware("ns/gone")).toEqual({ name: "gone", resource: undefined });
  });

  it("matches a bare token and returns undefined when unrecognised", () => {
    const p = new TraefikProvider();
    const mw = middleware("ns", "auth");
    p.index(mw);
    expect(p.resolveMiddleware("ns-auth")).toEqual({ name: "auth", resource: mw });
    expect(p.resolveMiddleware("bare")).toBeUndefined();
  });
});
