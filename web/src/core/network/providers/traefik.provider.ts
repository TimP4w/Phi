import { KubeResource } from "../../fluxTree/models/tree";
import { RESOURCE_TYPE } from "../../fluxTree/constants/resources.const";
import { NetworkProvider, ResolvedMiddleware } from "./networkProvider";

// Traefik provider: all Traefik-specific ref handling lives here. Middlewares are
// a Traefik CRD; refs reach the builder either as canonical "namespace/name"
// (IngressRoute) or as the "namespace-name@provider" token used in Ingress
// annotations and entrypoint args. The token split is ambiguous, so both forms
// are indexed and matched exactly.
export class TraefikProvider implements NetworkProvider {
  private byKey = new Map<string, KubeResource>();
  private byToken = new Map<string, KubeResource>();

  index(resource: KubeResource): void {
    if (resource.kind !== RESOURCE_TYPE.MIDDLEWARE) return;
    this.byKey.set(`${resource.namespace}/${resource.name}`, resource);
    this.byToken.set(`${resource.namespace}-${resource.name}`, resource);
  }

  resolveMiddleware(ref: string): ResolvedMiddleware | undefined {
    if (ref.includes("@")) {
      const token = ref.split("@")[0];
      const resource = this.byToken.get(token);
      return { name: resource?.name ?? token, resource };
    }
    if (ref.includes("/")) {
      const resource = this.byKey.get(ref);
      return { name: resource?.name ?? ref.split("/").pop()!, resource };
    }
    const resource = this.byToken.get(ref);
    return resource ? { name: resource.name, resource } : undefined;
  }
}
