package metrics

import (
	"context"
	"errors"
)

var (
	// ErrUnavailable means Prometheus is configured/discovered but not reachable.
	ErrUnavailable = errors.New("prometheus unavailable")
	// ErrDisabled means the integration is off (env-disabled or never discovered).
	ErrDisabled = errors.New("prometheus integration disabled")
	// ErrNoPods means the resource has no pod descendants to measure.
	ErrNoPods = errors.New("resource has no pods")
)

type Sample struct {
	Timestamp int64   `json:"t"`
	Value     float64 `json:"v"`
}

type Series []Sample

// SpecValue carries aggregated requests/limits. Limits is nil whenever any
// container in the set has no limit (a summed "max" would be meaningless);
// Requests is nil when no container in the set defines a request.
type SpecValue struct {
	Requests *float64 `json:"requests"`
	Limits   *float64 `json:"limits"`
}

type ResourceSpec struct {
	CPU    SpecValue `json:"cpu"`
	Memory SpecValue `json:"memory"`
}

// ResourceMetrics is the 24h detail payload (METRICS_RESOURCE).
type ResourceMetrics struct {
	// Range is the human-readable duration label the series cover, e.g. "24h".
	Range  string            `json:"range"`
	Series map[string]Series `json:"series"` // cpu, memory, networkRx, networkTx, diskRead, diskWrite
	Spec   ResourceSpec      `json:"spec"`
}

// CurrentUsage is the 15m sparkline payload per resource (METRICS_CURRENT).
type CurrentUsage struct {
	CPU    Series       `json:"cpu"`
	Memory Series       `json:"memory"`
	Spec   ResourceSpec `json:"spec"`
}

type NodeResourceUsage struct {
	Used     float64 `json:"used"`
	Capacity float64 `json:"capacity"`
	Percent  float64 `json:"percent"`
}

// NodeUsage is the per-cluster-node payload (METRICS_NODES).
type NodeUsage struct {
	Node   string            `json:"node"`
	CPU    NodeResourceUsage `json:"cpu"`
	Memory NodeResourceUsage `json:"memory"`
}

// StorageUsage is the per-resource storage rollup (METRICS_STORAGE). Requested
// is the sum of descendant PVC requests (bytes, always known from the resource
// tree); Used is the sum of measured filesystem usage from the kubelet
// (kubelet_volume_stats_used_bytes). PVCCount is how many PVCs the resource
// covers and Measured how many of them reported a usage sample — when Measured
// is below PVCCount the Used figure is partial (e.g. unmounted claims).
type StorageUsage struct {
	Requested int64 `json:"requested"`
	Used      int64 `json:"used"`
	PVCCount  int   `json:"pvcCount"`
	Measured  int   `json:"measured"`
}

type IntegrationState string

const (
	IntegrationActive      IntegrationState = "active"
	IntegrationUnavailable IntegrationState = "unavailable"
	IntegrationDisabled    IntegrationState = "disabled"
)

type IntegrationStatus struct {
	Name   string           `json:"name"`
	Status IntegrationState `json:"status"`
}

// MetricsService is the domain-facing metrics interface consumed by
// WatchMetricsUseCase. The implementation lives in infrastructure/prometheus
// (it is PromQL-specific); core only depends on this contract.
type MetricsService interface {
	GetResourceMetrics(ctx context.Context, uid string, rng string) (ResourceMetrics, error)
	GetCurrentUsage(ctx context.Context, uids []string) (map[string]CurrentUsage, error)
	GetStorageUsage(ctx context.Context, uids []string) (map[string]StorageUsage, error)
	GetNodeUsage(ctx context.Context) ([]NodeUsage, error)
	Status() IntegrationStatus
}
