package mcp

import (
	"context"
	"fmt"
	"math"
	"strings"

	mcplib "github.com/mark3labs/mcp-go/mcp"
	"github.com/timp4w/phi/internal/core/metrics"
)

// formatCores renders a CPU core count: sub-core values as millicores.
func formatCores(v float64) string {
	if v < 1 {
		return fmt.Sprintf("%dm", int(math.Round(v*1000)))
	}
	return fmt.Sprintf("%.2f", v)
}

// formatBytes renders a byte count using binary (Ki/Mi/Gi) units.
func formatBytes(v float64) string {
	units := []string{"B", "Ki", "Mi", "Gi", "Ti"}
	i := 0
	for v >= 1024 && i < len(units)-1 {
		v /= 1024
		i++
	}
	if v < 10 && i > 0 {
		return fmt.Sprintf("%.1f%s", v, units[i])
	}
	return fmt.Sprintf("%d%s", int(math.Round(v)), units[i])
}

// lastValue returns the most recent sample value in a series.
func lastValue(s metrics.Series) (float64, bool) {
	if len(s) == 0 {
		return 0, false
	}
	return s[len(s)-1].Value, true
}

// metricsReady reports whether the metrics integration can answer queries,
// returning a user-facing message when it cannot.
func (t *mcpTools) metricsReady() (bool, string) {
	if t.metricsSvc == nil {
		return false, "Metrics integration is not configured."
	}
	if st := t.metricsSvc.Status(); st.Status != metrics.IntegrationActive {
		return false, fmt.Sprintf("Prometheus integration is %s; no metrics available.", st.Status)
	}
	return true, ""
}

// writeSpecValue appends "current / requested / limit" with an over-limit flag.
func writeSpecValue(sb *strings.Builder, label string, current float64, hasCurrent bool, spec metrics.SpecValue, fmtVal func(float64) string) {
	fmt.Fprintf(sb, "  %s: ", label)
	if hasCurrent {
		sb.WriteString(fmtVal(current))
	} else {
		sb.WriteString("(no samples)")
	}
	if spec.Requests != nil {
		fmt.Fprintf(sb, " · requested %s", fmtVal(*spec.Requests))
	}
	if spec.Limits != nil {
		fmt.Fprintf(sb, " · limit %s", fmtVal(*spec.Limits))
		if hasCurrent && current > *spec.Limits {
			sb.WriteString("  ⚠ OVER LIMIT")
		}
	}
	sb.WriteString("\n")
}

func (t *mcpTools) getResourceMetrics(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	uid := getStringArg(req.GetArguments(), "uid")
	if uid == "" {
		return nil, fmt.Errorf("uid is required")
	}
	if ok, msg := t.metricsReady(); !ok {
		return mcplib.NewToolResultText(msg), nil
	}

	resource := t.store.GetResourceByUID(uid)
	if resource == nil {
		return nil, fmt.Errorf("resource not found: %s", uid)
	}

	usages, err := t.metricsSvc.GetCurrentUsage(ctx, []string{uid})
	if err != nil {
		return nil, fmt.Errorf("failed to get metrics: %w", err)
	}
	usage, ok := usages[uid]
	if !ok {
		return mcplib.NewToolResultText(fmt.Sprintf(
			"No metrics for %s/%s — it has no pods or no samples yet.",
			resource.Kind, resource.Name)), nil
	}

	cpu, hasCPU := lastValue(usage.CPU)
	mem, hasMem := lastValue(usage.Memory)

	var sb strings.Builder
	fmt.Fprintf(&sb, "Current usage for %s/%s (aggregate across pods):\n",
		resource.Kind, resource.Name)
	writeSpecValue(&sb, "CPU", cpu, hasCPU, usage.Spec.CPU, formatCores)
	writeSpecValue(&sb, "Memory", mem, hasMem, usage.Spec.Memory, formatBytes)

	return mcplib.NewToolResultText(sb.String()), nil
}

func (t *mcpTools) getNodeUsage(ctx context.Context, _ mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	if ok, msg := t.metricsReady(); !ok {
		return mcplib.NewToolResultText(msg), nil
	}

	nodes, err := t.metricsSvc.GetNodeUsage(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get node usage: %w", err)
	}
	if len(nodes) == 0 {
		return mcplib.NewToolResultText("No node metrics available."), nil
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "Cluster node usage (%d node(s)):\n", len(nodes))
	for _, n := range nodes {
		fmt.Fprintf(&sb, "- %s: CPU %s / %s (%.0f%%), Memory %s / %s (%.0f%%)\n",
			n.Node,
			formatCores(n.CPU.Used), formatCores(n.CPU.Capacity), n.CPU.Percent,
			formatBytes(n.Memory.Used), formatBytes(n.Memory.Capacity), n.Memory.Percent)
	}

	return mcplib.NewToolResultText(sb.String()), nil
}

// appendUsageDiagnostics adds a usage section to a diagnostic report when the
// metrics integration is active and the resource has data — surfacing
// over-limit CPU/memory that often explains throttling or OOM kills.
func (t *mcpTools) appendUsageDiagnostics(ctx context.Context, sb *strings.Builder, uid string) {
	if t.metricsSvc == nil {
		return
	}
	if st := t.metricsSvc.Status(); st.Status != metrics.IntegrationActive {
		return
	}
	usages, err := t.metricsSvc.GetCurrentUsage(ctx, []string{uid})
	if err != nil {
		return
	}
	usage, ok := usages[uid]
	if !ok {
		return
	}
	cpu, hasCPU := lastValue(usage.CPU)
	mem, hasMem := lastValue(usage.Memory)
	if !hasCPU && !hasMem {
		return
	}
	sb.WriteString("\nResource Usage:\n")
	writeSpecValue(sb, "CPU", cpu, hasCPU, usage.Spec.CPU, formatCores)
	writeSpecValue(sb, "Memory", mem, hasMem, usage.Spec.Memory, formatBytes)
}
