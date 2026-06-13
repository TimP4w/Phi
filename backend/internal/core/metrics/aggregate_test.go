package metrics_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/timp4w/phi/internal/core/metrics"
)

func key(name string) metrics.PodKey { return metrics.PodKey{Namespace: "ns", Name: name} }

func TestSumSeries_AlignsByTimestamp(t *testing.T) {
	byPod := map[metrics.PodKey]metrics.Series{
		key("a"): {{Timestamp: 10, Value: 1}, {Timestamp: 20, Value: 2}},
		key("b"): {{Timestamp: 10, Value: 5}, {Timestamp: 30, Value: 7}},
	}

	got := metrics.SumSeries(byPod, []metrics.PodKey{key("a"), key("b")})

	// Pointwise sum, sorted ascending by timestamp; t=20 only has a, t=30 only b.
	assert.Equal(t, metrics.Series{
		{Timestamp: 10, Value: 6},
		{Timestamp: 20, Value: 2},
		{Timestamp: 30, Value: 7},
	}, got)
}

func TestSumSeries_IgnoresUnselectedAndMissingKeys(t *testing.T) {
	byPod := map[metrics.PodKey]metrics.Series{
		key("a"): {{Timestamp: 1, Value: 3}},
		key("c"): {{Timestamp: 1, Value: 99}}, // not selected
	}

	// "b" has no series; "c" is present but not requested.
	got := metrics.SumSeries(byPod, []metrics.PodKey{key("a"), key("b")})

	assert.Equal(t, metrics.Series{{Timestamp: 1, Value: 3}}, got)
}

func TestSumSeries_EmptyKeys(t *testing.T) {
	got := metrics.SumSeries(map[metrics.PodKey]metrics.Series{key("a"): {{Timestamp: 1, Value: 1}}}, nil)
	assert.Empty(t, got)
}

func f(v float64) *float64 { return &v }

func TestAggregateSpec_ReportedWhenEveryContainerCovered(t *testing.T) {
	keys := []metrics.PodKey{key("a"), key("b")}
	containers := map[metrics.PodKey]float64{key("a"): 2, key("b"): 1}
	reqCount := map[metrics.PodKey]float64{key("a"): 2, key("b"): 1}
	limCount := map[metrics.PodKey]float64{key("a"): 2, key("b"): 1}
	req := map[metrics.PodKey]float64{key("a"): 100, key("b"): 50}
	lim := map[metrics.PodKey]float64{key("a"): 200, key("b"): 80}

	sv := metrics.AggregateSpec(keys, req, lim, reqCount, containers, limCount)

	assert.Equal(t, f(150), sv.Requests)
	assert.Equal(t, f(280), sv.Limits)
}

func TestAggregateSpec_NilWhenAnyContainerUncovered(t *testing.T) {
	keys := []metrics.PodKey{key("a"), key("b")}
	containers := map[metrics.PodKey]float64{key("a"): 2, key("b"): 2}
	// Pod b only declares a limit on 1 of its 2 containers: limits understated.
	reqCount := map[metrics.PodKey]float64{key("a"): 2, key("b"): 2}
	limCount := map[metrics.PodKey]float64{key("a"): 2, key("b"): 1}
	req := map[metrics.PodKey]float64{key("a"): 100, key("b"): 50}
	lim := map[metrics.PodKey]float64{key("a"): 200, key("b"): 80}

	sv := metrics.AggregateSpec(keys, req, lim, reqCount, containers, limCount)

	assert.Equal(t, f(150), sv.Requests)
	assert.Nil(t, sv.Limits)
}

func TestAggregateSpec_NilWhenContainerCountMissing(t *testing.T) {
	keys := []metrics.PodKey{key("a")}
	// No container count for the pod: neither requests nor limits can be trusted.
	sv := metrics.AggregateSpec(keys,
		map[metrics.PodKey]float64{key("a"): 100},
		map[metrics.PodKey]float64{key("a"): 200},
		map[metrics.PodKey]float64{key("a"): 1},
		map[metrics.PodKey]float64{}, // containers empty
		map[metrics.PodKey]float64{key("a"): 1},
	)

	assert.Nil(t, sv.Requests)
	assert.Nil(t, sv.Limits)
}

func TestAggregateSpec_EmptyKeys(t *testing.T) {
	sv := metrics.AggregateSpec(nil, nil, nil, nil, nil, nil)
	assert.Nil(t, sv.Requests)
	assert.Nil(t, sv.Limits)
}
