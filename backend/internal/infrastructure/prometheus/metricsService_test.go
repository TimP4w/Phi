package prometheus

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/metrics"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func seriesResult(labels map[string]string, samples ...metrics.Sample) SeriesResult {
	return SeriesResult{Labels: labels, Samples: samples}
}

func scalar(v float64) []SeriesResult {
	return []SeriesResult{seriesResult(nil, metrics.Sample{Timestamp: 1, Value: v})}
}

func podRes(uid, name string, parents ...string) *kube.Resource {
	return &kube.Resource{UID: uid, Kind: "Pod", Name: name, Namespace: "ns", ParentIDs: parents}
}

// storeWithPod wires a store where uid "p1" resolves to a single pod.
func storeWithPod(t *testing.T) *mocks.KubeStore {
	p := podRes("p1", "web-1")
	s := mocks.NewKubeStore(t)
	s.On("GetResourceByUID", "p1").Return(p).Maybe()
	s.On("GetResources").Return(map[string]*kube.Resource{"p1": p}).Maybe()
	return s
}

func TestGetResourceMetricsHappyPath(t *testing.T) {
	store := storeWithPod(t)
	prom := NewMockPrometheusService(t)

	// 6 range queries (cpu, memory, networkRx, networkTx, diskRead, diskWrite)
	prom.On("QueryRange", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).
		Return([]SeriesResult{seriesResult(nil,
			metrics.Sample{Timestamp: 100, Value: 1},
			metrics.Sample{Timestamp: 130, Value: 2},
		)}, nil).Times(6)

	m := `namespace=~"ns",pod=~"web-1"`
	// Spec instant queries: totals + coverage counts for cpu/memory plus container count.
	prom.On("Query", mock.Anything, QueryRequestsTotal(m, "cpu"), mock.Anything).Return(scalar(0.5), nil)
	prom.On("Query", mock.Anything, QueryRequestsTotal(m, "memory"), mock.Anything).Return(scalar(256), nil)
	prom.On("Query", mock.Anything, QueryLimitsTotal(m, "cpu"), mock.Anything).Return(scalar(2), nil)
	prom.On("Query", mock.Anything, QueryLimitsTotal(m, "memory"), mock.Anything).Return(scalar(512), nil)
	prom.On("Query", mock.Anything, QueryContainerCount(m), mock.Anything).Return(scalar(1), nil)
	prom.On("Query", mock.Anything, QueryRequestsCount(m, "cpu"), mock.Anything).Return(scalar(1), nil)
	prom.On("Query", mock.Anything, QueryRequestsCount(m, "memory"), mock.Anything).Return(scalar(1), nil)
	prom.On("Query", mock.Anything, QueryLimitsCount(m, "cpu"), mock.Anything).Return(scalar(1), nil)
	prom.On("Query", mock.Anything, QueryLimitsCount(m, "memory"), mock.Anything).Return(scalar(1), nil)

	svc := NewMetricsService(store, prom)
	rm, err := svc.GetResourceMetrics(context.Background(), "p1", "")

	assert.NoError(t, err)
	assert.Equal(t, "24h", rm.Range)
	assert.Len(t, rm.Series["cpu"], 2)
	assert.Len(t, rm.Series, 6)
	assert.Equal(t, 0.5, *rm.Spec.CPU.Requests)
	assert.Equal(t, 2.0, *rm.Spec.CPU.Limits)
	assert.Equal(t, 512.0, *rm.Spec.Memory.Limits)
}

func TestGetStorageUsage(t *testing.T) {
	// ks -> pvc1 (10Gi requested, measured) + pvc2 (5Gi requested, unmeasured)
	ks := &kube.Resource{UID: "ks", Kind: "Kustomization", Name: "ks", Namespace: "ns"}
	pvc1 := &kube.Resource{
		UID: "pvc1", Kind: "PersistentVolumeClaim", Name: "data-1", Namespace: "ns",
		ParentIDs: []string{"ks"}, PVCMetadata: &kube.PVCMetadata{Requested: 10},
	}
	pvc2 := &kube.Resource{
		UID: "pvc2", Kind: "PersistentVolumeClaim", Name: "data-2", Namespace: "ns",
		ParentIDs: []string{"ks"}, PVCMetadata: &kube.PVCMetadata{Requested: 5},
	}
	store := mocks.NewKubeStore(t)
	store.On("GetResourceByUID", "ks").Return(ks).Maybe()
	store.On("GetResources").Return(map[string]*kube.Resource{
		"ks": ks, "pvc1": pvc1, "pvc2": pvc2,
	}).Maybe()

	prom := NewMockPrometheusService(t)
	// Only data-1 reports a usage sample; data-2 is unmounted.
	prom.On("Query", mock.Anything, mock.Anything, mock.Anything).Return([]SeriesResult{
		seriesResult(map[string]string{"namespace": "ns", "persistentvolumeclaim": "data-1"},
			metrics.Sample{Timestamp: 1, Value: 7}),
	}, nil)

	svc := NewMetricsService(store, prom)
	out, err := svc.GetStorageUsage(context.Background(), []string{"ks"})

	assert.NoError(t, err)
	su := out["ks"]
	assert.Equal(t, int64(15), su.Requested)
	assert.Equal(t, int64(7), su.Used)
	assert.Equal(t, 2, su.PVCCount)
	assert.Equal(t, 1, su.Measured)
}

func TestGetStorageUsageNoPVCs(t *testing.T) {
	dep := &kube.Resource{UID: "dep", Kind: "Deployment", Name: "dep", Namespace: "ns"}
	store := mocks.NewKubeStore(t)
	store.On("GetResourceByUID", "dep").Return(dep).Maybe()
	store.On("GetResources").Return(map[string]*kube.Resource{"dep": dep}).Maybe()
	prom := NewMockPrometheusService(t)

	svc := NewMetricsService(store, prom)
	out, err := svc.GetStorageUsage(context.Background(), []string{"dep"})

	assert.NoError(t, err)
	assert.Empty(t, out)
}

func TestGetResourceMetricsLimitNullWhenContainerUnbounded(t *testing.T) {
	store := storeWithPod(t)
	prom := NewMockPrometheusService(t)
	prom.On("QueryRange", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).
		Return([]SeriesResult{}, nil).Times(6)
	m := `namespace=~"ns",pod=~"web-1"`
	// 2 containers but only 1 has a cpu limit -> cpu limit must be nil
	prom.On("Query", mock.Anything, QueryContainerCount(m), mock.Anything).Return(scalar(2), nil)
	prom.On("Query", mock.Anything, QueryLimitsCount(m, "cpu"), mock.Anything).Return(scalar(1), nil)
	prom.On("Query", mock.Anything, QueryLimitsCount(m, "memory"), mock.Anything).Return(scalar(2), nil)
	prom.On("Query", mock.Anything, mock.Anything, mock.Anything).Return(scalar(1), nil) // everything else

	svc := NewMetricsService(store, prom)
	rm, err := svc.GetResourceMetrics(context.Background(), "p1", "")

	assert.NoError(t, err)
	assert.Nil(t, rm.Spec.CPU.Limits)
	assert.NotNil(t, rm.Spec.Memory.Limits)
}

func TestGetResourceMetricsNoPods(t *testing.T) {
	ks := &kube.Resource{UID: "ks", Kind: "Kustomization"}
	store := mocks.NewKubeStore(t)
	store.On("GetResourceByUID", "ks").Return(ks)
	store.On("GetResources").Return(map[string]*kube.Resource{"ks": ks})

	svc := NewMetricsService(store, NewMockPrometheusService(t))
	_, err := svc.GetResourceMetrics(context.Background(), "ks", "")
	assert.ErrorIs(t, err, metrics.ErrNoPods)
}

func TestGetCurrentUsageAggregatesPodsPerUID(t *testing.T) {
	// dep -> pod1, pod2
	dep := &kube.Resource{UID: "dep", Kind: "Deployment", Name: "dep", Namespace: "ns"}
	all := map[string]*kube.Resource{
		"dep":  dep,
		"pod1": podRes("pod1", "web-1", "dep"),
		"pod2": podRes("pod2", "web-2", "dep"),
	}
	store := mocks.NewKubeStore(t)
	store.On("GetResourceByUID", "dep").Return(dep)
	store.On("GetResources").Return(all)

	prom := NewMockPrometheusService(t)
	byPod := func(p1, p2 float64) []SeriesResult {
		return []SeriesResult{
			seriesResult(map[string]string{"namespace": "ns", "pod": "web-1"}, metrics.Sample{Timestamp: 100, Value: p1}),
			seriesResult(map[string]string{"namespace": "ns", "pod": "web-2"}, metrics.Sample{Timestamp: 100, Value: p2}),
		}
	}
	matcher := `namespace=~"ns",pod=~"web-1|web-2"`
	prom.On("QueryRange", mock.Anything, QueryCPUUsageByPod(matcher), mock.Anything, mock.Anything, mock.Anything).Return(byPod(0.1, 0.2), nil)
	prom.On("QueryRange", mock.Anything, QueryMemoryUsageByPod(matcher), mock.Anything, mock.Anything, mock.Anything).Return(byPod(100, 200), nil)
	// spec by-pod instant queries: requests cpu/mem, limits cpu/mem, container count, limit counts
	prom.On("Query", mock.Anything, mock.Anything, mock.Anything).Return(byPod(1, 1), nil)

	svc := NewMetricsService(store, prom)
	out, err := svc.GetCurrentUsage(context.Background(), []string{"dep"})

	assert.NoError(t, err)
	usage := out["dep"]
	// pointwise sum at t=100: 0.1+0.2 / 100+200
	assert.InDelta(t, 0.3, usage.CPU[0].Value, 1e-9)
	assert.InDelta(t, 300.0, usage.Memory[0].Value, 1e-9)
	// spec: per-pod limits 1+1 with containerCount==limitCount==1 per pod -> limits aggregated
	assert.NotNil(t, usage.Spec.CPU.Limits)
	assert.InDelta(t, 2.0, *usage.Spec.CPU.Limits, 1e-9)
}

func TestGetCurrentUsageSkipsUIDsWithoutPods(t *testing.T) {
	ks := &kube.Resource{UID: "ks", Kind: "Kustomization"}
	store := mocks.NewKubeStore(t)
	store.On("GetResourceByUID", "ks").Return(ks)
	store.On("GetResources").Return(map[string]*kube.Resource{"ks": ks})
	store.On("GetResourceByUID", "ghost").Return((*kube.Resource)(nil))

	svc := NewMetricsService(store, NewMockPrometheusService(t))
	out, err := svc.GetCurrentUsage(context.Background(), []string{"ks", "ghost"})
	assert.NoError(t, err)
	assert.Empty(t, out)
}

func TestGetNodeUsageJoinsUname(t *testing.T) {
	store := mocks.NewKubeStore(t)
	prom := NewMockPrometheusService(t)
	inst := func(name string, v float64) SeriesResult {
		return seriesResult(map[string]string{"instance": name}, metrics.Sample{Timestamp: 1, Value: v})
	}
	prom.On("Query", mock.Anything, QueryNodeCPUUsed, mock.Anything).Return([]SeriesResult{inst("10.0.0.1:9100", 1.2)}, nil)
	prom.On("Query", mock.Anything, QueryNodeCPUCapacity, mock.Anything).Return([]SeriesResult{inst("10.0.0.1:9100", 4)}, nil)
	prom.On("Query", mock.Anything, QueryNodeMemUsed, mock.Anything).Return([]SeriesResult{inst("10.0.0.1:9100", 2e9)}, nil)
	prom.On("Query", mock.Anything, QueryNodeMemTotal, mock.Anything).Return([]SeriesResult{inst("10.0.0.1:9100", 8e9)}, nil)
	prom.On("Query", mock.Anything, QueryNodeUname, mock.Anything).Return([]SeriesResult{
		seriesResult(map[string]string{"instance": "10.0.0.1:9100", "nodename": "k3s-1"}, metrics.Sample{Timestamp: 1, Value: 1}),
	}, nil)

	svc := NewMetricsService(store, prom)
	nodes, err := svc.GetNodeUsage(context.Background())

	assert.NoError(t, err)
	assert.Len(t, nodes, 1)
	assert.Equal(t, "k3s-1", nodes[0].Node)
	assert.InDelta(t, 1.2, nodes[0].CPU.Used, 1e-9)
	assert.InDelta(t, 4.0, nodes[0].CPU.Capacity, 1e-9)
	assert.InDelta(t, 30.0, nodes[0].CPU.Percent, 1e-9)
	assert.InDelta(t, 25.0, nodes[0].Memory.Percent, 1e-9)
}

func TestGetNodeUsageFallsBackToInstance(t *testing.T) {
	store := mocks.NewKubeStore(t)
	prom := NewMockPrometheusService(t)
	inst := func(v float64) []SeriesResult {
		return []SeriesResult{seriesResult(map[string]string{"instance": "10.0.0.2:9100"}, metrics.Sample{Timestamp: 1, Value: v})}
	}
	prom.On("Query", mock.Anything, QueryNodeCPUUsed, mock.Anything).Return(inst(1), nil)
	prom.On("Query", mock.Anything, QueryNodeCPUCapacity, mock.Anything).Return(inst(2), nil)
	prom.On("Query", mock.Anything, QueryNodeMemUsed, mock.Anything).Return(inst(1), nil)
	prom.On("Query", mock.Anything, QueryNodeMemTotal, mock.Anything).Return(inst(2), nil)
	prom.On("Query", mock.Anything, QueryNodeUname, mock.Anything).Return([]SeriesResult{}, nil)

	svc := NewMetricsService(store, prom)
	nodes, err := svc.GetNodeUsage(context.Background())
	assert.NoError(t, err)
	assert.Equal(t, "10.0.0.2:9100", nodes[0].Node)
}

func TestMetricsServiceStatusDelegates(t *testing.T) {
	prom := NewMockPrometheusService(t)
	prom.On("Status").Return(metrics.IntegrationStatus{Name: "prometheus", Status: metrics.IntegrationActive})
	svc := NewMetricsService(mocks.NewKubeStore(t), prom)
	assert.Equal(t, metrics.IntegrationActive, svc.Status().Status)
}
