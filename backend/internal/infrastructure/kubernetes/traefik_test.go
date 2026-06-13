package kubernetes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTraefikIngressMiddlewaresAnnotation(t *testing.T) {
	annotations := map[string]string{
		"traefik.ingress.kubernetes.io/router.middlewares": "network-bouncer@kubernetescrd, network-home-ipwhitelist@kubernetescrd",
	}
	assert.Equal(t,
		[]string{"network-bouncer@kubernetescrd", "network-home-ipwhitelist@kubernetescrd"},
		traefikIngressMiddlewares(annotations),
	)
	assert.Nil(t, traefikIngressMiddlewares(map[string]string{}))
}

func TestToResource_Ingress_MiddlewareAnnotation(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Ingress", "networking.k8s.io/v1", "my-ing", "default")
	obj.Object["metadata"].(map[string]interface{})["annotations"] = map[string]interface{}{
		"traefik.ingress.kubernetes.io/router.middlewares": "authentik-ak-outpost@kubernetescrd",
	}
	obj.Object["spec"] = map[string]interface{}{}

	res := mapper.ToResource(*obj, "ingresses")
	assert.Equal(t, []string{"authentik-ak-outpost@kubernetescrd"}, res.RouteMetadata.MiddlewareRefs)
}

func TestToResource_TraefikProxy_EntrypointMiddlewares(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("DaemonSet", "apps/v1", "traefik", "network")
	obj.Object["spec"] = map[string]interface{}{
		"template": map[string]interface{}{
			"spec": map[string]interface{}{
				"containers": []interface{}{
					map[string]interface{}{
						"name": "traefik",
						"args": []interface{}{
							"--entryPoints.websecure.address=:443",
							"--entryPoints.websecure.http.middlewares=network-bouncer@kubernetescrd,network-default-headers@kubernetescrd",
							"--entryPoints.web.http.middlewares=network-bouncer@kubernetescrd",
						},
					},
				},
			},
		},
	}

	res := mapper.ToResource(*obj, "daemonsets")
	assert.Equal(t,
		[]string{"network-bouncer@kubernetescrd", "network-default-headers@kubernetescrd"},
		res.ProxyMetadata.EntrypointMiddlewares["websecure"],
	)
	assert.Equal(t,
		[]string{"network-bouncer@kubernetescrd"},
		res.ProxyMetadata.EntrypointMiddlewares["web"],
	)
}

func TestToResource_NonProxyWorkload_NoEntrypointMiddlewares(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("DaemonSet", "apps/v1", "node-exporter", "monitoring")
	obj.Object["spec"] = map[string]interface{}{
		"template": map[string]interface{}{
			"spec": map[string]interface{}{
				"containers": []interface{}{
					map[string]interface{}{"name": "x", "args": []interface{}{"--web.listen-address=:9100"}},
				},
			},
		},
	}

	res := mapper.ToResource(*obj, "daemonsets")
	assert.Empty(t, res.ProxyMetadata.EntrypointMiddlewares)
}
