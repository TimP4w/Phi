package mcp

import (
	"context"
	"fmt"
	"testing"

	mcplib "github.com/mark3labs/mcp-go/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	kubernetesusecases "github.com/timp4w/phi/internal/core/kubernetes/usecases"
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

func TestGetResource_Success(t *testing.T) {
	store := mocks.NewKubeStore(t)
	yamlUC := mocks.NewUseCase[kubernetesusecases.GetResourceYAMLInput, []byte](t)

	res := &kube.Resource{
		UID: "ks-uid", Kind: "Kustomization", Name: "my-app", Namespace: "default",
		Status: kube.StatusFailed, IsFluxManaged: true,
		FluxMetadata: kube.FluxMetadata{IsSuspended: false},
		Conditions: []kube.Condition{
			{Type: "Ready", Status: "False", Reason: "ArtifactFailed", Message: "failed to get artifact"},
		},
	}
	store.On("GetResourceByUID", "ks-uid").Return(res)
	yamlUC.On("Execute", kubernetesusecases.GetResourceYAMLInput{ResourceUid: "ks-uid"}).
		Return([]byte("apiVersion: kustomize.toolkit.fluxcd.io/v1\nkind: Kustomization\n"), nil)

	tools := &mcpTools{store: store, getResourceYAML: yamlUC}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{"uid": "ks-uid"}}}

	result, err := tools.getResource(context.Background(), req)

	require.NoError(t, err)
	text := result.Content[0].(mcplib.TextContent).Text
	assert.Contains(t, text, "Kustomization")
	assert.Contains(t, text, "ArtifactFailed")
	assert.Contains(t, text, "apiVersion: kustomize.toolkit.fluxcd.io/v1")
}

func TestGetResource_NotFound(t *testing.T) {
	store := mocks.NewKubeStore(t)
	store.On("GetResourceByUID", "missing").Return((*kube.Resource)(nil))

	tools := &mcpTools{store: store}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{"uid": "missing"}}}

	_, err := tools.getResource(context.Background(), req)

	assert.ErrorContains(t, err, "resource not found")
}

func TestGetResource_MissingUID(t *testing.T) {
	tools := &mcpTools{}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{}}}

	_, err := tools.getResource(context.Background(), req)

	assert.ErrorContains(t, err, "uid is required")
}

func TestGetTree_Success(t *testing.T) {
	store := mocks.NewKubeStore(t)

	res := &kube.Resource{
		UID: "repo-uid", Kind: "GitRepository", Name: "flux-system", Status: kube.StatusSuccess,
		Children: []kube.Resource{
			{
				UID: "ks-uid", Kind: "Kustomization", Name: "my-app", Status: kube.StatusFailed,
				Children: []kube.Resource{
					{UID: "dep-uid", Kind: "Deployment", Name: "my-app", Status: kube.StatusSuccess},
				},
			},
		},
	}
	store.On("GetResourceByUID", "repo-uid").Return(res)

	tools := &mcpTools{store: store}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{"uid": "repo-uid"}}}

	result, err := tools.getTree(context.Background(), req)

	require.NoError(t, err)
	text := result.Content[0].(mcplib.TextContent).Text
	assert.Contains(t, text, "GitRepository/flux-system")
	assert.Contains(t, text, "Kustomization/my-app")
	assert.Contains(t, text, "Deployment/my-app")
}

func TestGetTree_NotFound(t *testing.T) {
	store := mocks.NewKubeStore(t)
	store.On("GetResourceByUID", "missing").Return((*kube.Resource)(nil))

	tools := &mcpTools{store: store}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{"uid": "missing"}}}

	_, err := tools.getTree(context.Background(), req)

	assert.ErrorContains(t, err, "resource not found")
}

func TestDiagnoseResource_WithFailures(t *testing.T) {
	store := mocks.NewKubeStore(t)

	res := &kube.Resource{
		UID: "ks-uid", Kind: "Kustomization", Name: "my-app", Namespace: "default",
		Status: kube.StatusFailed,
		Conditions: []kube.Condition{
			{Type: "Ready", Status: "False", Reason: "ArtifactFailed", Message: "failed to get artifact"},
			{Type: "Reconciling", Status: "True", Reason: "Progressing", Message: ""},
		},
		Events: []kube.Event{
			{Reason: "ReconcileFailed", Message: "failed to apply manifests"},
			{Reason: "ImagePulled", Message: "successfully pulled"},
		},
		ParentIDs: []string{"repo-uid"},
	}
	parent := &kube.Resource{UID: "repo-uid", Kind: "GitRepository", Name: "flux-system", Status: kube.StatusSuccess}
	store.On("GetResourceByUID", "ks-uid").Return(res)
	store.On("GetResourceByUID", "repo-uid").Return(parent)

	tools := &mcpTools{store: store}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{"uid": "ks-uid"}}}

	result, err := tools.diagnoseResource(context.Background(), req)

	require.NoError(t, err)
	text := result.Content[0].(mcplib.TextContent).Text
	assert.Contains(t, text, "ArtifactFailed")
	assert.Contains(t, text, "ReconcileFailed")
	assert.NotContains(t, text, "ImagePulled")
	assert.Contains(t, text, "GitRepository/flux-system")
}

func TestDiagnoseResource_NotFound(t *testing.T) {
	store := mocks.NewKubeStore(t)
	store.On("GetResourceByUID", "missing").Return((*kube.Resource)(nil))

	tools := &mcpTools{store: store}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{"uid": "missing"}}}

	_, err := tools.diagnoseResource(context.Background(), req)

	assert.ErrorContains(t, err, "resource not found")
}

func TestGetEvents_NoFilter(t *testing.T) {
	eventsUC := mocks.NewUseCase[kubernetesusecases.GetEventsInput, []kube.Event](t)
	eventsUC.On("Execute", kubernetesusecases.GetEventsInput{}).Return([]kube.Event{
		{Reason: "ReconcileFailed", Message: "failed", Namespace: "default", Name: "my-app"},
		{Reason: "Pulled", Message: "image pulled", Namespace: "default", Name: "other"},
	}, nil)

	tools := &mcpTools{getEventsUC: eventsUC}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{}}}

	result, err := tools.getEvents(context.Background(), req)

	require.NoError(t, err)
	text := result.Content[0].(mcplib.TextContent).Text
	assert.Contains(t, text, "ReconcileFailed")
	assert.Contains(t, text, "Pulled")
}

func TestGetEvents_NamespaceFilter(t *testing.T) {
	eventsUC := mocks.NewUseCase[kubernetesusecases.GetEventsInput, []kube.Event](t)
	eventsUC.On("Execute", kubernetesusecases.GetEventsInput{}).Return([]kube.Event{
		{Reason: "ReconcileFailed", Message: "failed", Namespace: "default", Name: "my-app"},
		{Reason: "Pulled", Message: "image pulled", Namespace: "infra", Name: "other"},
	}, nil)

	tools := &mcpTools{getEventsUC: eventsUC}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{"namespace": "default"}}}

	result, err := tools.getEvents(context.Background(), req)

	require.NoError(t, err)
	text := result.Content[0].(mcplib.TextContent).Text
	assert.Contains(t, text, "ReconcileFailed")
	assert.NotContains(t, text, "Pulled")
}

func TestGetEvents_ServiceError(t *testing.T) {
	eventsUC := mocks.NewUseCase[kubernetesusecases.GetEventsInput, []kube.Event](t)
	eventsUC.On("Execute", kubernetesusecases.GetEventsInput{}).Return([]kube.Event(nil), fmt.Errorf("k8s unavailable"))

	tools := &mcpTools{getEventsUC: eventsUC}
	req := mcplib.CallToolRequest{Params: mcplib.CallToolParams{Arguments: map[string]interface{}{}}}

	_, err := tools.getEvents(context.Background(), req)

	assert.ErrorContains(t, err, "failed to get events")
}
