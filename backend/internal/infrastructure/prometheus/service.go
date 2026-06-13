package prometheus

import (
	"context"
	"time"

	"github.com/timp4w/phi/internal/core/metrics"
)

// SeriesResult is one series returned by a Prometheus query, with its labels.
type SeriesResult struct {
	Labels  map[string]string
	Samples []metrics.Sample
}

// PrometheusService is the low-level Prometheus API client, kept as an
// interface so the PromQL-driven MetricsService implementation can be tested
// against a mock.
type PrometheusService interface {
	// Query runs an instant query at ts.
	Query(ctx context.Context, query string, ts time.Time) ([]SeriesResult, error)
	// QueryRange runs a range query.
	QueryRange(ctx context.Context, query string, start, end time.Time, step time.Duration) ([]SeriesResult, error)
	// Status reports discovery + health state.
	Status() metrics.IntegrationStatus
}
