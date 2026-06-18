package prometheus

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/metrics"
)

const defaultPort = 9090

// locator resolves the Prometheus base URL: env override first, otherwise
// well-known Services from the KubeStore cache. Results are cached for 30s
// so a missing Prometheus is re-checked without hammering the store.
type locator struct {
	store     kube.KubeStore
	mu        sync.Mutex
	cachedURL string
	cachedErr error
	cachedAt  time.Time
}

func newLocator(store kube.KubeStore) *locator {
	return &locator{store: store}
}

func (l *locator) Resolve() (string, error) {
	// Only the literal "false" (any case) disables; all other values mean enabled.
	if strings.EqualFold(os.Getenv("PHI_PROMETHEUS_ENABLED"), "false") {
		return "", metrics.ErrDisabled
	}
	if url := os.Getenv("PHI_PROMETHEUS_URL"); url != "" {
		return strings.TrimRight(url, "/"), nil
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	if time.Since(l.cachedAt) < 30*time.Second {
		return l.cachedURL, l.cachedErr
	}
	l.cachedURL, l.cachedErr = l.discover()
	l.cachedAt = time.Now()
	return l.cachedURL, l.cachedErr
}

func (l *locator) discover() (string, error) {
	for _, r := range l.store.GetResources() {
		if r.Kind == "Service" && isPrometheusService(r) {
			return fmt.Sprintf("http://%s.%s.svc:%d", r.Name, r.Namespace, prometheusPort(r)), nil
		}
	}
	// Undiscovered maps to ErrDisabled: the integration simply stays off until
	// a Prometheus service appears in the store or an URL is configured.
	return "", fmt.Errorf("no prometheus service discovered in cluster: %w", metrics.ErrDisabled)
}

// isPrometheusService recognises the Service fronting a Prometheus-compatible
// HTTP API across the common packagings: the prometheus-operator (the
// "prometheus-operated" headless Service or the app.kubernetes.io/name label,
// also used by kube-prometheus-stack and the modern Helm chart) and the legacy
// "app" label / chart Service names. Other PromQL-speaking backends (Thanos,
// Mimir, VictoriaMetrics) are reached via PHI_PROMETHEUS_URL.
func isPrometheusService(r *kube.Resource) bool {
	if r.Labels["app.kubernetes.io/name"] == "prometheus" || r.Labels["app"] == "prometheus" {
		return true
	}
	switch r.Name {
	case "prometheus-operated", "prometheus-k8s", "prometheus-server":
		return true
	}
	return false
}

// prometheusPort prefers the Service's HTTP API port (named web/http-web/http,
// or the well-known 9090), falling back to the first declared port and finally
// to defaultPort so a non-standard listener is still reachable.
func prometheusPort(r *kube.Resource) int32 {
	if r.ServiceMetadata == nil {
		return defaultPort
	}
	for _, p := range r.ServiceMetadata.Ports {
		switch p.Name {
		case "web", "http-web", "http":
			return p.Port
		}
		if p.Port == defaultPort {
			return p.Port
		}
	}
	if len(r.ServiceMetadata.Ports) > 0 {
		return r.ServiceMetadata.Ports[0].Port
	}
	return defaultPort
}
