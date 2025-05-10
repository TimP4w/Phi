package mocks

import (
	"context"

	"github.com/stretchr/testify/mock"
	"github.com/timp4w/phi/internal/core/kubernetes"
)

type MockKubeService struct {
	mock.Mock
}

func (m *MockKubeService) GetEvents() ([]kubernetes.Event, error) {
	args := m.Called()
	return args.Get(0).([]kubernetes.Event), args.Error(1)
}

func (m *MockKubeService) FindAllApis() (*kubernetes.ResourceMap, error) {
	args := m.Called()
	return args.Get(0).(*kubernetes.ResourceMap), args.Error(1)
}

func (m *MockKubeService) FindAllResources(rm *kubernetes.ResourceMap) (map[string]*kubernetes.Resource, error) {
	args := m.Called(rm)
	return args.Get(0).(map[string]*kubernetes.Resource), args.Error(1)
}

func (m *MockKubeService) GetResourceYAML(resource kubernetes.Resource) ([]byte, error) {
	args := m.Called(resource)
	return args.Get(0).([]byte), args.Error(1)
}

func (m *MockKubeService) WatchLogs(pod kubernetes.Resource, ctx context.Context, onLog func(kubernetes.KubeLog)) error {
	args := m.Called(pod, ctx, onLog)
	return args.Error(0)
}

func (m *MockKubeService) WatchResources(
	kinds map[string]struct{},
	addFunc func(kubernetes.Resource),
	updateFunc func(oldEl, newEl kubernetes.Resource),
	deleteFunc func(kubernetes.Resource),
) {
	m.Called(kinds, addFunc, updateFunc, deleteFunc)
}

func (m *MockKubeService) WatchEvents(onEvent func(*kubernetes.Event)) {
	m.Called(onEvent)
}

func (m *MockKubeService) Reconcile(el kubernetes.Resource) (*kubernetes.Resource, error) {
	args := m.Called(el)
	return args.Get(0).(*kubernetes.Resource), args.Error(1)
}

func (m *MockKubeService) Suspend(el kubernetes.Resource) (*kubernetes.Resource, error) {
	args := m.Called(el)
	return args.Get(0).(*kubernetes.Resource), args.Error(1)
}

func (m *MockKubeService) Resume(el kubernetes.Resource) (*kubernetes.Resource, error) {
	args := m.Called(el)
	return args.Get(0).(*kubernetes.Resource), args.Error(1)
}

func (m *MockKubeService) GetInformerChannels() map[string]chan struct{} {
	args := m.Called()
	return args.Get(0).(map[string]chan struct{})
}
