package prometheus

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
)

func pod(ns, name string) kube.Resource {
	return kube.Resource{Kind: "Pod", Namespace: ns, Name: name, UID: ns + "/" + name}
}

func TestBuildPodMatcherSingleNamespace(t *testing.T) {
	m := BuildPodMatcher([]kube.Resource{pod("default", "web-abc"), pod("default", "web-def")})
	assert.Equal(t, `namespace=~"default",pod=~"web-abc|web-def"`, m)
}

func TestBuildPodMatcherMultiNamespaceSortedDeduped(t *testing.T) {
	m := BuildPodMatcher([]kube.Resource{
		pod("zoo", "b"), pod("app", "a"), pod("zoo", "b"), // duplicate pod
	})
	assert.Equal(t, `namespace=~"app|zoo",pod=~"a|b"`, m)
}

func TestBuildPodMatcherEscapesRegexMeta(t *testing.T) {
	m := BuildPodMatcher([]kube.Resource{pod("default", "web.v1+x")})
	assert.Equal(t, `namespace=~"default",pod=~"web\\.v1\\+x"`, m)
}

func TestQueryCPUUsage(t *testing.T) {
	q := QueryCPUUsage(`namespace=~"default",pod=~"a"`)
	assert.Equal(t,
		`sum(rate(container_cpu_usage_seconds_total{namespace=~"default",pod=~"a",container!="",container!="POD"}[5m]))`,
		q)
}

func TestQueryCPUUsageByPod(t *testing.T) {
	q := QueryCPUUsageByPod(`namespace=~"default",pod=~"a"`)
	assert.Equal(t,
		`sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{namespace=~"default",pod=~"a",container!="",container!="POD"}[5m]))`,
		q)
}

func TestQueryMemoryUsage(t *testing.T) {
	q := QueryMemoryUsage(`namespace=~"d",pod=~"a"`)
	assert.Equal(t,
		`sum(container_memory_working_set_bytes{namespace=~"d",pod=~"a",container!="",container!="POD"})`,
		q)
}

func TestNetworkQueriesHaveNoContainerFilter(t *testing.T) {
	// container_network_* metrics are pod-level; a container filter would drop them.
	assert.Equal(t,
		`sum(rate(container_network_receive_bytes_total{namespace=~"d",pod=~"a"}[5m]))`,
		QueryNetworkRx(`namespace=~"d",pod=~"a"`))
	assert.Equal(t,
		`sum(rate(container_network_transmit_bytes_total{namespace=~"d",pod=~"a"}[5m]))`,
		QueryNetworkTx(`namespace=~"d",pod=~"a"`))
}

func TestDiskQueries(t *testing.T) {
	assert.Equal(t,
		`sum(rate(container_fs_reads_bytes_total{namespace=~"d",pod=~"a",container!="",container!="POD"}[5m]))`,
		QueryDiskRead(`namespace=~"d",pod=~"a"`))
	assert.Equal(t,
		`sum(rate(container_fs_writes_bytes_total{namespace=~"d",pod=~"a",container!="",container!="POD"}[5m]))`,
		QueryDiskWrite(`namespace=~"d",pod=~"a"`))
}

func TestSpecQueries(t *testing.T) {
	m := `namespace=~"d",pod=~"a"`
	assert.Equal(t, `sum(kube_pod_container_resource_requests{namespace=~"d",pod=~"a",resource="cpu"})`, QueryRequestsTotal(m, "cpu"))
	assert.Equal(t, `sum(kube_pod_container_resource_limits{namespace=~"d",pod=~"a",resource="memory"})`, QueryLimitsTotal(m, "memory"))
	assert.Equal(t, `count(kube_pod_container_info{namespace=~"d",pod=~"a"})`, QueryContainerCount(m))
	assert.Equal(t, `count(kube_pod_container_resource_requests{namespace=~"d",pod=~"a",resource="cpu"})`, QueryRequestsCount(m, "cpu"))
	assert.Equal(t, `count(kube_pod_container_resource_limits{namespace=~"d",pod=~"a",resource="cpu"})`, QueryLimitsCount(m, "cpu"))
	assert.Equal(t, `count by (namespace, pod) (kube_pod_container_resource_requests{namespace=~"d",pod=~"a",resource="cpu"})`, QueryRequestsCountByPod(m, "cpu"))
	assert.Equal(t, `sum by (namespace, pod) (kube_pod_container_resource_requests{namespace=~"d",pod=~"a",resource="cpu"})`, QueryRequestsByPod(m, "cpu"))
	assert.Equal(t, `sum by (namespace, pod) (kube_pod_container_resource_limits{namespace=~"d",pod=~"a",resource="cpu"})`, QueryLimitsByPod(m, "cpu"))
	assert.Equal(t, `count by (namespace, pod) (kube_pod_container_info{namespace=~"d",pod=~"a"})`, QueryContainerCountByPod(m))
	assert.Equal(t, `count by (namespace, pod) (kube_pod_container_resource_limits{namespace=~"d",pod=~"a",resource="cpu"})`, QueryLimitsCountByPod(m, "cpu"))
}

func TestStepForRange(t *testing.T) {
	// ~200 points, never below 30s, rounded to whole seconds
	assert.Equal(t, 432*time.Second, StepForRange(24*time.Hour))
	assert.Equal(t, 30*time.Second, StepForRange(15*time.Minute))
}
