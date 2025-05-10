package kubernetesusecases

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"k8s.io/apimachinery/pkg/types"

	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/kubernetes/mocks"
)

func TestGetEventsUseCaseExecuteSuccess(t *testing.T) {
	mockKubeService := new(mocks.MockKubeService)
	expectedEvents := []kubernetes.Event{
		{
			UID:           types.UID("123"),
			Kind:          "Pod",
			Name:          "mypod",
			Namespace:     "default",
			Reason:        "Started",
			Message:       "Container started",
			Source:        "kubelet",
			Type:          "Normal",
			FirstObserved: time.Now().Add(-10 * time.Minute),
			LastObserved:  time.Now(),
			Count:         1,
			ResourceUID:   "res-123",
		},
	}
	mockKubeService.On("GetEvents").Return(expectedEvents, nil)

	useCase := &GetEventsUseCase{
		kubeService: mockKubeService,
	}
	result, err := useCase.Execute(struct{}{})

	assert.NoError(t, err)
	assert.Equal(t, expectedEvents, result)
	mockKubeService.AssertExpectations(t)
}

func TestGetEventsUseCaseExecuteError(t *testing.T) {
	mockKubeService := new(mocks.MockKubeService)
	mockKubeService.On("GetEvents").Return([]kubernetes.Event{}, errors.New("kube error"))

	useCase := &GetEventsUseCase{
		kubeService: mockKubeService,
	}
	result, err := useCase.Execute(struct{}{})

	assert.Error(t, err)
	assert.Nil(t, result)
	mockKubeService.AssertExpectations(t)
}
