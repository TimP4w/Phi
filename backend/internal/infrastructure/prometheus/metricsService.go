package prometheus

import (
	"context"
	"sort"
	"time"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/metrics"
)

const (
	detailRange    = 24 * time.Hour
	sparklineRange = 15 * time.Minute
	sparklineStep  = 30 * time.Second
)

type metricsService struct {
	store  kube.KubeStore
	prom   PrometheusService
	logger *logging.PhiLogger
}

// NewMetricsService implements the core metrics.MetricsService by translating
// resource-tree context into PromQL against the Prometheus client.
func NewMetricsService(store kube.KubeStore, prom PrometheusService) metrics.MetricsService {
	return &metricsService{store: store, prom: prom, logger: logging.Logger()}
}

func (s *metricsService) Status() metrics.IntegrationStatus {
	return s.prom.Status()
}

func (s *metricsService) GetResourceMetrics(ctx context.Context, uid string) (metrics.ResourceMetrics, error) {
	pods, err := metrics.CollectPods(s.store, uid)
	if err != nil {
		return metrics.ResourceMetrics{}, err
	}
	matcher := BuildPodMatcher(pods)

	end := time.Now()
	start := end.Add(-detailRange)
	step := StepForRange(detailRange)

	queries := map[string]string{
		"cpu":       QueryCPUUsage(matcher),
		"memory":    QueryMemoryUsage(matcher),
		"networkRx": QueryNetworkRx(matcher),
		"networkTx": QueryNetworkTx(matcher),
		"diskRead":  QueryDiskRead(matcher),
		"diskWrite": QueryDiskWrite(matcher),
	}
	series := map[string]metrics.Series{}
	for name, q := range queries {
		res, err := s.prom.QueryRange(ctx, q, start, end, step)
		if err != nil {
			return metrics.ResourceMetrics{}, err
		}
		if len(res) > 0 {
			series[name] = res[0].Samples
		} else {
			series[name] = metrics.Series{}
		}
	}

	spec, err := s.fetchSpec(ctx, matcher)
	if err != nil {
		return metrics.ResourceMetrics{}, err
	}

	return metrics.ResourceMetrics{Range: "24h", Series: series, Spec: spec}, nil
}

// fetchSpec aggregates requests/limits over the matched pod set. Limits are
// nil when any container lacks one (count(limits) < count(containers)).
func (s *metricsService) fetchSpec(ctx context.Context, matcher string) (metrics.ResourceSpec, error) {
	now := time.Now()
	scalarOf := func(query string) (*float64, error) {
		res, err := s.prom.Query(ctx, query, now)
		if err != nil {
			return nil, err
		}
		if len(res) == 0 || len(res[0].Samples) == 0 {
			return nil, nil
		}
		v := res[0].Samples[0].Value
		return &v, nil
	}

	containerCount, err := scalarOf(QueryContainerCount(matcher))
	if err != nil {
		return metrics.ResourceSpec{}, err
	}

	spec := metrics.ResourceSpec{}
	for _, res := range []struct {
		name string
		dst  *metrics.SpecValue
	}{
		{"cpu", &spec.CPU},
		{"memory", &spec.Memory},
	} {
		reqSum, err := scalarOf(QueryRequestsTotal(matcher, res.name))
		if err != nil {
			return metrics.ResourceSpec{}, err
		}
		res.dst.Requests = reqSum

		limSum, err := scalarOf(QueryLimitsTotal(matcher, res.name))
		if err != nil {
			return metrics.ResourceSpec{}, err
		}
		limCount, err := scalarOf(QueryLimitsCount(matcher, res.name))
		if err != nil {
			return metrics.ResourceSpec{}, err
		}
		if limSum != nil && limCount != nil && containerCount != nil && *limCount >= *containerCount {
			res.dst.Limits = limSum
		}
	}
	return spec, nil
}

type podKey struct{ namespace, name string }

func keyOf(labels map[string]string) podKey {
	return podKey{namespace: labels["namespace"], name: labels["pod"]}
}

func (s *metricsService) GetCurrentUsage(ctx context.Context, uids []string) (map[string]metrics.CurrentUsage, error) {
	podsByUID := map[string][]kube.Resource{}
	allPods := map[string]kube.Resource{}
	for _, uid := range uids {
		pods, err := metrics.CollectPods(s.store, uid)
		if err != nil {
			continue // unknown or podless resources are simply omitted
		}
		podsByUID[uid] = pods
		for _, p := range pods {
			allPods[p.UID] = p
		}
	}
	if len(podsByUID) == 0 {
		return map[string]metrics.CurrentUsage{}, nil
	}

	union := make([]kube.Resource, 0, len(allPods))
	for _, p := range allPods {
		union = append(union, p)
	}
	matcher := BuildPodMatcher(union)

	end := time.Now()
	start := end.Add(-sparklineRange)

	rangeByPod := func(query string) (map[podKey]metrics.Series, error) {
		res, err := s.prom.QueryRange(ctx, query, start, end, sparklineStep)
		if err != nil {
			return nil, err
		}
		out := map[podKey]metrics.Series{}
		for _, r := range res {
			out[keyOf(r.Labels)] = r.Samples
		}
		return out, nil
	}
	instantByPod := func(query string) (map[podKey]float64, error) {
		res, err := s.prom.Query(ctx, query, end)
		if err != nil {
			return nil, err
		}
		out := map[podKey]float64{}
		for _, r := range res {
			if len(r.Samples) > 0 {
				out[keyOf(r.Labels)] = r.Samples[0].Value
			}
		}
		return out, nil
	}

	cpuByPod, err := rangeByPod(QueryCPUUsageByPod(matcher))
	if err != nil {
		return nil, err
	}
	memByPod, err := rangeByPod(QueryMemoryUsageByPod(matcher))
	if err != nil {
		return nil, err
	}
	reqCPU, err := instantByPod(QueryRequestsByPod(matcher, "cpu"))
	if err != nil {
		return nil, err
	}
	reqMem, err := instantByPod(QueryRequestsByPod(matcher, "memory"))
	if err != nil {
		return nil, err
	}
	limCPU, err := instantByPod(QueryLimitsByPod(matcher, "cpu"))
	if err != nil {
		return nil, err
	}
	limMem, err := instantByPod(QueryLimitsByPod(matcher, "memory"))
	if err != nil {
		return nil, err
	}
	containerCount, err := instantByPod(QueryContainerCountByPod(matcher))
	if err != nil {
		return nil, err
	}
	limCountCPU, err := instantByPod(QueryLimitsCountByPod(matcher, "cpu"))
	if err != nil {
		return nil, err
	}
	limCountMem, err := instantByPod(QueryLimitsCountByPod(matcher, "memory"))
	if err != nil {
		return nil, err
	}

	out := map[string]metrics.CurrentUsage{}
	for uid, pods := range podsByUID {
		keys := make([]podKey, 0, len(pods))
		for _, p := range pods {
			keys = append(keys, podKey{namespace: p.Namespace, name: p.Name})
		}
		out[uid] = metrics.CurrentUsage{
			CPU:    sumSeries(cpuByPod, keys),
			Memory: sumSeries(memByPod, keys),
			Spec: metrics.ResourceSpec{
				CPU:    aggregateSpec(keys, reqCPU, limCPU, containerCount, limCountCPU),
				Memory: aggregateSpec(keys, reqMem, limMem, containerCount, limCountMem),
			},
		}
	}
	return out, nil
}

// sumSeries adds per-pod series pointwise, aligned by timestamp.
func sumSeries(byPod map[podKey]metrics.Series, keys []podKey) metrics.Series {
	acc := map[int64]float64{}
	for _, k := range keys {
		for _, s := range byPod[k] {
			acc[s.Timestamp] += s.Value
		}
	}
	ts := make([]int64, 0, len(acc))
	for t := range acc {
		ts = append(ts, t)
	}
	sort.Slice(ts, func(i, j int) bool { return ts[i] < ts[j] })
	out := make(metrics.Series, 0, len(ts))
	for _, t := range ts {
		out = append(out, metrics.Sample{Timestamp: t, Value: acc[t]})
	}
	return out
}

// aggregateSpec sums requests/limits over pods; limits are nil unless every
// pod has a limit on every container.
func aggregateSpec(keys []podKey, req, lim, containers, limCount map[podKey]float64) metrics.SpecValue {
	var sv metrics.SpecValue
	reqSum, reqSeen := 0.0, false
	limSum, limOK := 0.0, true
	for _, k := range keys {
		if v, ok := req[k]; ok {
			reqSum += v
			reqSeen = true
		}
		l, hasLim := lim[k]
		c := containers[k]
		lc := limCount[k]
		if !hasLim || lc < c {
			limOK = false
		} else {
			limSum += l
		}
	}
	if reqSeen {
		sv.Requests = &reqSum
	}
	if limOK && len(keys) > 0 {
		sv.Limits = &limSum
	}
	return sv
}

func (s *metricsService) GetNodeUsage(ctx context.Context) ([]metrics.NodeUsage, error) {
	now := time.Now()
	byInstance := func(query string) (map[string]float64, error) {
		res, err := s.prom.Query(ctx, query, now)
		if err != nil {
			return nil, err
		}
		out := map[string]float64{}
		for _, r := range res {
			if len(r.Samples) > 0 {
				out[r.Labels["instance"]] = r.Samples[0].Value
			}
		}
		return out, nil
	}

	cpuUsed, err := byInstance(QueryNodeCPUUsed)
	if err != nil {
		return nil, err
	}
	cpuCap, err := byInstance(QueryNodeCPUCapacity)
	if err != nil {
		return nil, err
	}
	memUsed, err := byInstance(QueryNodeMemUsed)
	if err != nil {
		return nil, err
	}
	memTotal, err := byInstance(QueryNodeMemTotal)
	if err != nil {
		return nil, err
	}

	names := map[string]string{}
	unameRes, err := s.prom.Query(ctx, QueryNodeUname, now)
	if err != nil {
		return nil, err
	}
	for _, r := range unameRes {
		if n := r.Labels["nodename"]; n != "" {
			names[r.Labels["instance"]] = n
		}
	}

	nodes := make([]metrics.NodeUsage, 0, len(cpuCap))
	for instance, capacity := range cpuCap {
		name := names[instance]
		if name == "" {
			name = instance
		}
		nodes = append(nodes, metrics.NodeUsage{
			Node:   name,
			CPU:    usageOf(cpuUsed[instance], capacity),
			Memory: usageOf(memUsed[instance], memTotal[instance]),
		})
	}
	sort.Slice(nodes, func(i, j int) bool { return nodes[i].Node < nodes[j].Node })
	return nodes, nil
}

func usageOf(used, capacity float64) metrics.NodeResourceUsage {
	u := metrics.NodeResourceUsage{Used: used, Capacity: capacity}
	if capacity > 0 {
		u.Percent = used / capacity * 100
	}
	return u
}
