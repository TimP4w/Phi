package prometheus

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
)

// containerFilter drops cAdvisor's pod-aggregate series (container="") and the
// pause/infra-container series (container="POD"), leaving only app containers.
const containerFilter = `,container!="",container!="POD"`

// promqlQuoteMeta escapes regex metacharacters for use inside a PromQL =~
// string literal. PromQL regex literals are RE2 regexes inside JSON-like
// double-quoted strings, so a backslash must itself be escaped: we produce
// `\\.` for a literal dot, `\\+` for a literal plus, etc.
func promqlQuoteMeta(s string) string {
	// regexp.QuoteMeta adds one backslash; we need two for PromQL.
	return strings.ReplaceAll(regexp.QuoteMeta(s), `\`, `\\`)
}

// BuildPodMatcher builds a PromQL label matcher selecting the given pods.
// Namespaces and pod names are deduplicated, sorted (determinism for tests
// and Prometheus query caching), and regex-escaped.
//
// Note: a single namespace-regex × pod-regex matcher can in theory cross-match
// a same-named pod in another selected namespace; pod name hash suffixes make
// this collision practically impossible and it keeps everything to one query.
func BuildPodMatcher(pods []kube.Resource) string {
	nsSet := map[string]struct{}{}
	podSet := map[string]struct{}{}
	for _, p := range pods {
		nsSet[promqlQuoteMeta(p.Namespace)] = struct{}{}
		podSet[promqlQuoteMeta(p.Name)] = struct{}{}
	}
	return fmt.Sprintf(`namespace=~"%s",pod=~"%s"`, joinSorted(nsSet), joinSorted(podSet))
}

func joinSorted(set map[string]struct{}) string {
	items := make([]string, 0, len(set))
	for s := range set {
		items = append(items, s)
	}
	sort.Strings(items)
	return strings.Join(items, "|")
}

func QueryCPUUsage(matcher string) string {
	return fmt.Sprintf(`sum(rate(container_cpu_usage_seconds_total{%s%s}[5m]))`, matcher, containerFilter)
}

func QueryCPUUsageByPod(matcher string) string {
	return fmt.Sprintf(`sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{%s%s}[5m]))`, matcher, containerFilter)
}

func QueryMemoryUsage(matcher string) string {
	return fmt.Sprintf(`sum(container_memory_working_set_bytes{%s%s})`, matcher, containerFilter)
}

func QueryMemoryUsageByPod(matcher string) string {
	return fmt.Sprintf(`sum by (namespace, pod) (container_memory_working_set_bytes{%s%s})`, matcher, containerFilter)
}

func QueryNetworkRx(matcher string) string {
	return fmt.Sprintf(`sum(rate(container_network_receive_bytes_total{%s}[5m]))`, matcher)
}

func QueryNetworkTx(matcher string) string {
	return fmt.Sprintf(`sum(rate(container_network_transmit_bytes_total{%s}[5m]))`, matcher)
}

func QueryDiskRead(matcher string) string {
	return fmt.Sprintf(`sum(rate(container_fs_reads_bytes_total{%s%s}[5m]))`, matcher, containerFilter)
}

func QueryDiskWrite(matcher string) string {
	return fmt.Sprintf(`sum(rate(container_fs_writes_bytes_total{%s%s}[5m]))`, matcher, containerFilter)
}

// --- kube-state-metrics spec queries (resource is "cpu" or "memory") ---

func QueryRequestsTotal(matcher, resource string) string {
	return fmt.Sprintf(`sum(kube_pod_container_resource_requests{%s,resource="%s"})`, matcher, resource)
}

func QueryLimitsTotal(matcher, resource string) string {
	return fmt.Sprintf(`sum(kube_pod_container_resource_limits{%s,resource="%s"})`, matcher, resource)
}

func QueryContainerCount(matcher string) string {
	return fmt.Sprintf(`count(kube_pod_container_info{%s})`, matcher)
}

func QueryLimitsCount(matcher, resource string) string {
	return fmt.Sprintf(`count(kube_pod_container_resource_limits{%s,resource="%s"})`, matcher, resource)
}

func QueryRequestsByPod(matcher, resource string) string {
	return fmt.Sprintf(`sum by (namespace, pod) (kube_pod_container_resource_requests{%s,resource="%s"})`, matcher, resource)
}

func QueryLimitsByPod(matcher, resource string) string {
	return fmt.Sprintf(`sum by (namespace, pod) (kube_pod_container_resource_limits{%s,resource="%s"})`, matcher, resource)
}

func QueryContainerCountByPod(matcher string) string {
	return fmt.Sprintf(`count by (namespace, pod) (kube_pod_container_info{%s})`, matcher)
}

func QueryLimitsCountByPod(matcher, resource string) string {
	return fmt.Sprintf(`count by (namespace, pod) (kube_pod_container_resource_limits{%s,resource="%s"})`, matcher, resource)
}

// --- node-exporter queries (constants — no matcher) ---

const (
	QueryNodeCPUUsed     = `sum by (instance) (rate(node_cpu_seconds_total{mode!="idle"}[5m]))`
	QueryNodeCPUCapacity = `count by (instance) (node_cpu_seconds_total{mode="idle"})`
	QueryNodeMemUsed     = `node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes`
	QueryNodeMemTotal    = `node_memory_MemTotal_bytes`
	QueryNodeUname       = `node_uname_info`
)

// StepForRange targets ~200 points per range, with a 30s floor.
func StepForRange(r time.Duration) time.Duration {
	step := r / 200
	if step < 30*time.Second {
		return 30 * time.Second
	}
	return step.Truncate(time.Second)
}
