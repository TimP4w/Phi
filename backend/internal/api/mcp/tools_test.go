package mcp

import (
	"context"
	"testing"

	mcplib "github.com/mark3labs/mcp-go/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func TestListResources_NoFilter(t *testing.T) {
	store := mocks.NewKubeStore(t)
	store.On("GetResources").Return(map[string]*kube.Resource{
		"uid-1": {UID: "uid-1", Kind: "Kustomization", Name: "my-app", Namespace: "default", Status: kube.StatusSuccess, IsFluxManaged: true},
		"uid-2": {UID: "uid-2", Kind: "HelmRelease", Name: "redis", Namespace: "infra", Status: kube.StatusFailed, IsFluxManaged: true},
	})

	tools := &mcpTools{store: store}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{}}}

	result, err := tools.listResources(context.Background(), req)

	require.NoError(t, err)
	assert.Contains(t, result.Content[0].(mcplib.TextContent).Text, "Kustomization/my-app")
	assert.Contains(t, result.Content[0].(mcplib.TextContent).Text, "HelmRelease/redis")
}

func TestListResources_NamespaceFilter(t *testing.T) {
	store := mocks.NewKubeStore(t)
	store.On("GetResources").Return(map[string]*kube.Resource{
		"uid-1": {UID: "uid-1", Kind: "Kustomization", Name: "my-app", Namespace: "default", Status: kube.StatusSuccess},
		"uid-2": {UID: "uid-2", Kind: "HelmRelease", Name: "redis", Namespace: "infra", Status: kube.StatusFailed},
	})

	tools := &mcpTools{store: store}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{"namespace": "default"}}}

	result, err := tools.listResources(context.Background(), req)

	require.NoError(t, err)
	text := result.Content[0].(mcplib.TextContent).Text
	assert.Contains(t, text, "Kustomization/my-app")
	assert.NotContains(t, text, "HelmRelease/redis")
}

func TestListResources_NoResults(t *testing.T) {
	store := mocks.NewKubeStore(t)
	store.On("GetResources").Return(map[string]*kube.Resource{})

	tools := &mcpTools{store: store}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{}}}

	result, err := tools.listResources(context.Background(), req)

	require.NoError(t, err)
	assert.Contains(t, result.Content[0].(mcplib.TextContent).Text, "No resources found")
}
