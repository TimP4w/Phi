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
		if r.Kind != "Service" {
			continue
		}
		if r.Labels["app.kubernetes.io/name"] == "prometheus" || r.Name == "prometheus-operated" {
			return fmt.Sprintf("http://%s.%s.svc:%d", r.Name, r.Namespace, defaultPort), nil
		}
	}
	// Undiscovered maps to ErrDisabled: the integration simply stays off until
	// a Prometheus service appears in the store or an URL is configured.
	return "", fmt.Errorf("no prometheus service discovered in cluster: %w", metrics.ErrDisabled)
}
