package kubernetesusecases

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/timp4w/phi/internal/core/kubernetes"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func TestSyncResourcesUseCaseExecuteSuccess(t *testing.T) {
	mockKubeSvc := mocks.NewKubeService(t)
	mockKubeStore := mocks.NewKubeStore(t)

	apis := &kubernetes.ResourceMap{}
	resources := map[string]*kubernetes.Resource{
		"flux-system": {
			UID:       "uid-1",
			Kind:      "Kustomization",
			Name:      "flux-system",
			Namespace: "flux-system",
			Version:   "v1",
		},
	}

	mockKubeSvc.On("DiscoverApis").Return(apis, nil)
	mockKubeSvc.On("DiscoverResources", apis).Return(resources, nil)
	mockKubeStore.On("SetResources", resources).Return(resources)
	mockKubeStore.On("RegisterResource", mock.Anything).Return()

	uc := NewSyncResourcesUseCase(mockKubeSvc, mockKubeStore)

	_, err := uc.Execute(struct{}{})
	assert.NoError(t, err)
}

func TestSyncResourcesUseCaseExecuteError(t *testing.T) {
	mockKubeSvc := mocks.NewKubeService(t)
	mockKubeStore := mocks.NewKubeStore(t)

	errTest := errors.New("fail apis")
	mockKubeSvc.On("DiscoverApis").Return((*kubernetes.ResourceMap)(nil), errTest)

	uc := NewSyncResourcesUseCase(mockKubeSvc, mockKubeStore)

	_, err := uc.Execute(struct{}{})
	assert.Error(t, err)
}
