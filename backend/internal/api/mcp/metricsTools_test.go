package mcp

import (
	"context"
	"testing"

	mcplib "github.com/mark3labs/mcp-go/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/metrics"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func ptr(v float64) *float64 { return &v }

func activeMetrics(t *testing.T) *mocks.MetricsService {
	m := mocks.NewMetricsService(t)
	m.On("Status").Return(metrics.IntegrationStatus{Name: "prometheus", Status: metrics.IntegrationActive}).Maybe()
	return m
}

func TestFormatCoresAndBytes(t *testing.T) {
	assert.Equal(t, "350m", formatCores(0.35))
	assert.Equal(t, "2.00", formatCores(2))
	assert.Equal(t, "512Mi", formatBytes(512*1024*1024))
	assert.Equal(t, "1.5Gi", formatBytes(1536*1024*1024))
}

func TestGetResourceMetrics_OverLimit(t *testing.T) {
	store := mocks.NewKubeStore(t)
	store.On("GetResourceByUID", "p1").Return(&kube.Resource{UID: "p1", Kind: "Pod", Name: "web"})
	m := activeMetrics(t)
	m.On("GetCurrentUsage", context.Background(), []string{"p1"}).Return(map[string]metrics.CurrentUsage{
		"p1": {
			CPU:    metrics.Series{{Timestamp: 1, Value: 0.5}},
			Memory: metrics.Series{{Timestamp: 1, Value: 600 * 1024 * 1024}},
			Spec: metrics.ResourceSpec{
				CPU:    metrics.SpecValue{Requests: ptr(0.25), Limits: ptr(1)},
				Memory: metrics.SpecValue{Requests: ptr(256 * 1024 * 1024), Limits: ptr(512 * 1024 * 1024)},
			},
		},
	}, nil)

	tools := &mcpTools{store: store, metricsSvc: m}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{"uid": "p1"}}}
	result, err := tools.getResourceMetrics(context.Background(), req)

	require.NoError(t, err)
	text := result.Content[0].(mcplib.TextContent).Text
	assert.Contains(t, text, "CPU: 500m · requested 250m · limit 1.00")
	assert.Contains(t, text, "OVER LIMIT") // memory 600Mi > 512Mi limit
}

func TestGetResourceMetrics_IntegrationDisabled(t *testing.T) {
	m := mocks.NewMetricsService(t)
	m.On("Status").Return(metrics.IntegrationStatus{Name: "prometheus", Status: metrics.IntegrationDisabled})
	tools := &mcpTools{metricsSvc: m}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{"uid": "p1"}}}
	result, err := tools.getResourceMetrics(context.Background(), req)
	require.NoError(t, err)
	assert.Contains(t, result.Content[0].(mcplib.TextContent).Text, "Prometheus integration is disabled")
}

func TestGetResourceMetrics_NotConfigured(t *testing.T) {
	tools := &mcpTools{}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{"uid": "p1"}}}
	result, err := tools.getResourceMetrics(context.Background(), req)
	require.NoError(t, err)
	assert.Contains(t, result.Content[0].(mcplib.TextContent).Text, "not configured")
}

func TestGetResourceMetrics_MissingUID(t *testing.T) {
	tools := &mcpTools{}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{}}}
	_, err := tools.getResourceMetrics(context.Background(), req)
	assert.ErrorContains(t, err, "uid is required")
}

func TestGetNodeUsage_Success(t *testing.T) {
	m := activeMetrics(t)
	m.On("GetNodeUsage", context.Background()).Return([]metrics.NodeUsage{
		{Node: "k3s-1", CPU: metrics.NodeResourceUsage{Used: 1.2, Capacity: 4, Percent: 30}, Memory: metrics.NodeResourceUsage{Used: 2 * 1024 * 1024 * 1024, Capacity: 8 * 1024 * 1024 * 1024, Percent: 25}},
	}, nil)
	tools := &mcpTools{metricsSvc: m}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{}}}
	result, err := tools.getNodeUsage(context.Background(), req)
	require.NoError(t, err)
	text := result.Content[0].(mcplib.TextContent).Text
	assert.Contains(t, text, "k3s-1")
	assert.Contains(t, text, "CPU 1.20 / 4.00 (30%)")
	assert.Contains(t, text, "(25%)")
}
