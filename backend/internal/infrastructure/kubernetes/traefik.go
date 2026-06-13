package kubernetes

import (
	"regexp"
	"strings"

	kube "github.com/timp4w/phi/internal/core/kubernetes"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// This file is the Traefik provider: all Traefik-specific parsing lives here and
// is invoked additively from the generic mapper. Nothing outside this file knows
// about Traefik. Other ingress controllers (nginx, caddy, …) can be supported by
// adding sibling providers without touching the generic mapping or the domain
// model — controllers with no middleware concept simply contribute nothing.

const (
	traefikEntrypointsAnnotation = "traefik.ingress.kubernetes.io/router.entrypoints"
	traefikMiddlewaresAnnotation = "traefik.ingress.kubernetes.io/router.middlewares"
)

// traefikHostMatcher captures the argument list of a Host(`...`) matcher within a
// Traefik route match expression, e.g. Host(`a.com`, `b.com`) && PathPrefix(`/`).
var traefikHostMatcher = regexp.MustCompile("Host\\(([^)]*)\\)")

// traefikHostArg extracts each backtick-quoted hostname from a matcher's args.
var traefikHostArg = regexp.MustCompile("`([^`]+)`")

// traefikEntrypointMiddlewareArg matches a static-config arg that binds
// middlewares to an entrypoint, e.g.
// --entryPoints.websecure.http.middlewares=ns-a@kubernetescrd,ns-b@kubernetescrd
var traefikEntrypointMiddlewareArg = regexp.MustCompile(`(?i)^--entry[pP]oints\.([^.]+)\.http\.middlewares=(.+)$`)

func parseTraefikHosts(match string) []string {
	var hosts []string
	for _, m := range traefikHostMatcher.FindAllStringSubmatch(match, -1) {
		for _, arg := range traefikHostArg.FindAllStringSubmatch(m[1], -1) {
			hosts = append(hosts, arg[1])
		}
	}
	return hosts
}

func splitCSV(value string) []string {
	var out []string
	for _, part := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

// traefikIngressEntrypoints reads the entrypoints an Ingress binds to from the
// Traefik annotation. Returns nil for non-Traefik Ingresses.
func traefikIngressEntrypoints(annotations map[string]string) []string {
	return splitCSV(annotations[traefikEntrypointsAnnotation])
}

// traefikIngressMiddlewares reads the middlewares applied to an Ingress from the
// Traefik annotation, as raw refs (e.g. "network-bouncer@kubernetescrd"). The
// frontend resolves these to Middleware resources. Returns nil when absent.
func traefikIngressMiddlewares(annotations map[string]string) []string {
	return splitCSV(annotations[traefikMiddlewaresAnnotation])
}

func mapTraefikIngressRouteData(el *kube.Resource, obj unstructured.Unstructured) {
	routes, found, err := unstructured.NestedSlice(obj.Object, "spec", "routes")
	if err != nil || !found {
		return
	}

	route := kube.RouteMetadata{}
	if tls, found, _ := unstructured.NestedMap(obj.Object, "spec", "tls"); found && tls != nil {
		route.TLSEnabled = true
		if secret, ok := tls["secretName"].(string); ok && secret != "" {
			route.TLSSecretRefs = append(route.TLSSecretRefs, el.Namespace+"/"+secret)
		}
	}
	if eps, found, _ := unstructured.NestedStringSlice(obj.Object, "spec", "entryPoints"); found {
		route.EntryPoints = eps
	}
	for _, r := range routes {
		rule, ok := r.(map[string]any)
		if !ok {
			continue
		}
		if match, ok := rule["match"].(string); ok {
			route.Hostnames = append(route.Hostnames, parseTraefikHosts(match)...)
		}
		if middlewares, ok := rule["middlewares"].([]any); ok {
			for _, m := range middlewares {
				mm, ok := m.(map[string]any)
				if !ok {
					continue
				}
				name := nestedString(mm, "name")
				if name == "" {
					continue
				}
				ns := el.Namespace
				if n := nestedString(mm, "namespace"); n != "" {
					ns = n
				}
				route.MiddlewareRefs = append(route.MiddlewareRefs, ns+"/"+name)
			}
		}
		services, ok := rule["services"].([]any)
		if !ok {
			continue
		}
		for _, s := range services {
			svc, ok := s.(map[string]any)
			if !ok {
				continue
			}
			name, _ := svc["name"].(string)
			if name == "" {
				continue
			}
			ns := el.Namespace
			if n, ok := svc["namespace"].(string); ok && n != "" {
				ns = n
			}
			ref := kube.BackendRef{Kind: "Service", Name: name, Namespace: ns}
			if p, ok := svc["port"].(int64); ok {
				ref.Port = int32(p)
			}
			route.BackendRefs = append(route.BackendRefs, ref)
		}
	}

	el.RouteMetadata = route
}

// traefikProxyData detects a Traefik proxy workload and extracts the middlewares
// bound to each entrypoint from its container args. No-ops for any workload that
// doesn't carry Traefik entrypoint args, so non-Traefik Deployments/DaemonSets
// are unaffected.
func traefikProxyData(el *kube.Resource, obj unstructured.Unstructured) {
	containers, found, err := unstructured.NestedSlice(obj.Object, "spec", "template", "spec", "containers")
	if err != nil || !found {
		return
	}

	entrypointMiddlewares := map[string][]string{}
	for _, c := range containers {
		cm, ok := c.(map[string]any)
		if !ok {
			continue
		}
		args, ok := cm["args"].([]any)
		if !ok {
			continue
		}
		for _, a := range args {
			arg, ok := a.(string)
			if !ok {
				continue
			}
			if m := traefikEntrypointMiddlewareArg.FindStringSubmatch(arg); m != nil {
				entrypointMiddlewares[m[1]] = append(entrypointMiddlewares[m[1]], splitCSV(m[2])...)
			}
		}
	}

	if len(entrypointMiddlewares) > 0 {
		el.ProxyMetadata = kube.ProxyMetadata{EntrypointMiddlewares: entrypointMiddlewares}
	}
}
