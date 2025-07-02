package kubernetesusecases

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"k8s.io/apimachinery/pkg/types"

	"github.com/timp4w/phi/internal/core/kubernetes"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func TestGetEventsUseCaseExecuteSuccess(t *testing.T) {
	mockKubeSvc := mocks.NewKubeService(t)

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
	mockKubeSvc.On("GetEvents").Return(expectedEvents, nil)

	useCase := NewGetEventsUseCase(mockKubeSvc)
	result, err := useCase.Execute(struct{}{})

	assert.NoError(t, err)
	assert.Equal(t, expectedEvents, result)
	mockKubeSvc.AssertExpectations(t)
}

func TestGetEventsUseCaseExecuteError(t *testing.T) {
	mockKubeSvc := mocks.NewKubeService(t)
	mockKubeSvc.On("GetEvents").Return([]kubernetes.Event{}, errors.New("kube error"))

	useCase := NewGetEventsUseCase(mockKubeSvc)
	result, err := useCase.Execute(struct{}{})

	assert.Error(t, err)
	assert.Nil(t, result)
	mockKubeSvc.AssertExpectations(t)
}
