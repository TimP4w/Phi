package kubernetesusecases

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func TestGetResourceYAMLUseCase_Success(t *testing.T) {
	store := mocks.NewKubeStore(t)
	kubeSvc := mocks.NewKubeService(t)

	res := &kube.Resource{UID: "pod-uid", Name: "my-pod"}
	store.On("GetResourceByUID", "pod-uid").Return(res)
	kubeSvc.On("GetResourceYAML", *res).Return([]byte("apiVersion: v1\nkind: Pod\n"), nil)

	uc := NewGetResourceYAMLUseCase(kubeSvc, store)
	yaml, err := uc.Execute(GetResourceYAMLInput{ResourceUid: "pod-uid"})

	require.NoError(t, err)
	assert.Contains(t, string(yaml), "kind: Pod")
}

func TestGetResourceYAMLUseCase_ResourceNotFound(t *testing.T) {
	store := mocks.NewKubeStore(t)
	kubeSvc := mocks.NewKubeService(t)

	store.On("GetResourceByUID", "missing").Return((*kube.Resource)(nil))

	uc := NewGetResourceYAMLUseCase(kubeSvc, store)
	_, err := uc.Execute(GetResourceYAMLInput{ResourceUid: "missing"})

	assert.ErrorContains(t, err, "resource not found")
	kubeSvc.AssertNotCalled(t, "GetResourceYAML")
}

func TestGetResourceYAMLUseCase_ServiceError(t *testing.T) {
	store := mocks.NewKubeStore(t)
	kubeSvc := mocks.NewKubeService(t)

	res := &kube.Resource{UID: "pod-uid"}
	store.On("GetResourceByUID", "pod-uid").Return(res)
	kubeSvc.On("GetResourceYAML", *res).Return([]byte(nil), errors.New("not found in cluster"))

	uc := NewGetResourceYAMLUseCase(kubeSvc, store)
	_, err := uc.Execute(GetResourceYAMLInput{ResourceUid: "pod-uid"})

	assert.ErrorContains(t, err, "not found in cluster")
}
