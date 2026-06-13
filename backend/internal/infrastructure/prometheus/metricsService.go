package prometheus

import (
	"context"
	"math"
	"sort"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

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
// resource-tree context into PromQL against the Prometheus client. The
// backend-agnostic aggregation (series summation, requests/limits coverage
// rules) lives in core/metrics; this layer only owns the PromQL.
func NewMetricsService(store kube.KubeStore, prom PrometheusService) metrics.MetricsService {
	return &metricsService{store: store, prom: prom, logger: logging.Logger()}
}

func (s *metricsService) Status() metrics.IntegrationStatus {
	return s.prom.Status()
}

func keyOf(labels map[string]string) metrics.PodKey {
	return metrics.PodKey{Namespace: labels["namespace"], Name: labels["pod"]}
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

	// All series queries and the spec lookup are independent, so run them
	// concurrently rather than as a chain of sequential round-trips.
	series := map[string]metrics.Series{}
	var spec metrics.ResourceSpec
	g, gctx := errgroup.WithContext(ctx)
	var mu sync.Mutex
	for name, q := range queries {
		name, q := name, q
		g.Go(func() error {
			res, err := s.prom.QueryRange(gctx, q, start, end, step)
			if err != nil {
				return err
			}
			samples := metrics.Series{}
			if len(res) > 0 {
				samples = res[0].Samples
			}
			mu.Lock()
			series[name] = samples
			mu.Unlock()
			return nil
		})
	}
	g.Go(func() error {
		sp, err := s.fetchSpec(gctx, matcher)
		if err != nil {
			return err
		}
		spec = sp
		return nil
	})
	if err := g.Wait(); err != nil {
		return metrics.ResourceMetrics{}, err
	}

	return metrics.ResourceMetrics{Range: "24h", Series: series, Spec: spec}, nil
}

// scalarOf runs an instant query expected to return a single scalar series,
// returning nil when the series (or sample) is absent.
func (s *metricsService) scalarOf(ctx context.Context, query string, ts time.Time) (*float64, error) {
	res, err := s.prom.Query(ctx, query, ts)
	if err != nil {
		return nil, err
	}
	if len(res) == 0 || len(res[0].Samples) == 0 {
		return nil, nil
	}
	v := res[0].Samples[0].Value
	return &v, nil
}

// fetchSpec aggregates requests/limits over the matched pod set using
// server-side sum/count (the detail view needs totals, not a per-pod
// breakdown). A value is reported only when its count covers every container.
func (s *metricsService) fetchSpec(ctx context.Context, matcher string) (metrics.ResourceSpec, error) {
	now := time.Now()
	var (
		containerCount                       *float64
		reqCPU, reqCntCPU, limCPU, limCntCPU *float64
		reqMem, reqCntMem, limMem, limCntMem *float64
	)
	g, gctx := errgroup.WithContext(ctx)
	scalar := func(query string, dst **float64) {
		g.Go(func() error {
			v, err := s.scalarOf(gctx, query, now)
			if err != nil {
				return err
			}
			*dst = v
			return nil
		})
	}
	scalar(QueryContainerCount(matcher), &containerCount)
	scalar(QueryRequestsTotal(matcher, "cpu"), &reqCPU)
	scalar(QueryRequestsCount(matcher, "cpu"), &reqCntCPU)
	scalar(QueryLimitsTotal(matcher, "cpu"), &limCPU)
	scalar(QueryLimitsCount(matcher, "cpu"), &limCntCPU)
	scalar(QueryRequestsTotal(matcher, "memory"), &reqMem)
	scalar(QueryRequestsCount(matcher, "memory"), &reqCntMem)
	scalar(QueryLimitsTotal(matcher, "memory"), &limMem)
	scalar(QueryLimitsCount(matcher, "memory"), &limCntMem)
	if err := g.Wait(); err != nil {
		return metrics.ResourceSpec{}, err
	}

	return metrics.ResourceSpec{
		CPU:    coveredSpec(reqCPU, reqCntCPU, limCPU, limCntCPU, containerCount),
		Memory: coveredSpec(reqMem, reqCntMem, limMem, limCntMem, containerCount),
	}, nil
}

// coveredSpec reports a requests/limits total only when its count covers every
// container, mirroring core's AggregateSpec for the per-pod path.
func coveredSpec(reqSum, reqCount, limSum, limCount, containerCount *float64) metrics.SpecValue {
	covers := func(count *float64) bool {
		return count != nil && containerCount != nil && *count >= *containerCount
	}
	var sv metrics.SpecValue
	if reqSum != nil && covers(reqCount) {
		sv.Requests = reqSum
	}
	if limSum != nil && covers(limCount) {
		sv.Limits = limSum
	}
	return sv
}

func (s *metricsService) rangeByPod(ctx context.Context, query string, start, end time.Time) (map[metrics.PodKey]metrics.Series, error) {
	res, err := s.prom.QueryRange(ctx, query, start, end, sparklineStep)
	if err != nil {
		return nil, err
	}
	out := map[metrics.PodKey]metrics.Series{}
	for _, r := range res {
		out[keyOf(r.Labels)] = r.Samples
	}
	return out, nil
}

func (s *metricsService) instantByPod(ctx context.Context, query string, ts time.Time) (map[metrics.PodKey]float64, error) {
	res, err := s.prom.Query(ctx, query, ts)
	if err != nil {
		return nil, err
	}
	out := map[metrics.PodKey]float64{}
	for _, r := range res {
		if len(r.Samples) > 0 {
			out[keyOf(r.Labels)] = r.Samples[0].Value
		}
	}
	return out, nil
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

	var (
		cpuByPod, memByPod                       map[metrics.PodKey]metrics.Series
		reqCPU, reqMem, limCPU, limMem           map[metrics.PodKey]float64
		containerCount, limCountCPU, limCountMem map[metrics.PodKey]float64
		reqCountCPU, reqCountMem                 map[metrics.PodKey]float64
	)
	g, gctx := errgroup.WithContext(ctx)
	rng := func(query string, dst *map[metrics.PodKey]metrics.Series) {
		g.Go(func() error {
			m, err := s.rangeByPod(gctx, query, start, end)
			if err != nil {
				return err
			}
			*dst = m
			return nil
		})
	}
	inst := func(query string, dst *map[metrics.PodKey]float64) {
		g.Go(func() error {
			m, err := s.instantByPod(gctx, query, end)
			if err != nil {
				return err
			}
			*dst = m
			return nil
		})
	}
	rng(QueryCPUUsageByPod(matcher), &cpuByPod)
	rng(QueryMemoryUsageByPod(matcher), &memByPod)
	inst(QueryRequestsByPod(matcher, "cpu"), &reqCPU)
	inst(QueryRequestsByPod(matcher, "memory"), &reqMem)
	inst(QueryLimitsByPod(matcher, "cpu"), &limCPU)
	inst(QueryLimitsByPod(matcher, "memory"), &limMem)
	inst(QueryContainerCountByPod(matcher), &containerCount)
	inst(QueryRequestsCountByPod(matcher, "cpu"), &reqCountCPU)
	inst(QueryRequestsCountByPod(matcher, "memory"), &reqCountMem)
	inst(QueryLimitsCountByPod(matcher, "cpu"), &limCountCPU)
	inst(QueryLimitsCountByPod(matcher, "memory"), &limCountMem)
	if err := g.Wait(); err != nil {
		return nil, err
	}

	out := map[string]metrics.CurrentUsage{}
	for uid, pods := range podsByUID {
		keys := make([]metrics.PodKey, 0, len(pods))
		for _, p := range pods {
			keys = append(keys, metrics.PodKey{Namespace: p.Namespace, Name: p.Name})
		}
		out[uid] = metrics.CurrentUsage{
			CPU:    metrics.SumSeries(cpuByPod, keys),
			Memory: metrics.SumSeries(memByPod, keys),
			Spec: metrics.ResourceSpec{
				CPU:    metrics.AggregateSpec(keys, reqCPU, limCPU, reqCountCPU, containerCount, limCountCPU),
				Memory: metrics.AggregateSpec(keys, reqMem, limMem, reqCountMem, containerCount, limCountMem),
			},
		}
	}
	return out, nil
}

func (s *metricsService) GetNodeUsage(ctx context.Context) ([]metrics.NodeUsage, error) {
	now := time.Now()
	byInstance := func(ctx context.Context, query string) (map[string]float64, error) {
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

	var (
		cpuUsed, cpuCap, memUsed, memTotal map[string]float64
		unameRes                           []SeriesResult
	)
	g, gctx := errgroup.WithContext(ctx)
	load := func(query string, dst *map[string]float64) {
		g.Go(func() error {
			m, err := byInstance(gctx, query)
			if err != nil {
				return err
			}
			*dst = m
			return nil
		})
	}
	load(QueryNodeCPUUsed, &cpuUsed)
	load(QueryNodeCPUCapacity, &cpuCap)
	load(QueryNodeMemUsed, &memUsed)
	load(QueryNodeMemTotal, &memTotal)
	g.Go(func() error {
		res, err := s.prom.Query(gctx, QueryNodeUname, now)
		if err != nil {
			return err
		}
		unameRes = res
		return nil
	})
	if err := g.Wait(); err != nil {
		return nil, err
	}

	names := map[string]string{}
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
		// rate()/instant samples can momentarily exceed capacity; clamp so the
		// UI progress bar never reports over 100%.
		u.Percent = math.Min(used/capacity*100, 100)
	}
	return u
}
