package kubernetesusecases

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/realtime"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func makeWatchEventsUseCase(t *testing.T) (*WatchEventsUseCase, *mocks.KubeService, *mocks.KubeStore, *mocks.RealtimeService) {
	kubeSvc := mocks.NewKubeService(t)
	store := mocks.NewKubeStore(t)
	rtSvc := mocks.NewRealtimeService(t)
	treeSvc := mocks.NewTreeService(t)

	uc := NewWatchEventsUseCase(treeSvc, rtSvc, kubeSvc, store).(*WatchEventsUseCase)
	return uc, kubeSvc, store, rtSvc
}

func TestWatchEventsUseCase_Execute_CallsWatchEvents(t *testing.T) {
	uc, kubeSvc, _, _ := makeWatchEventsUseCase(t)

	kubeSvc.On("WatchEvents", mock.Anything).Return()

	_, err := uc.Execute(WatchEventsInput{})
	assert.NoError(t, err)
	kubeSvc.AssertCalled(t, "WatchEvents", mock.Anything)
}

func TestWatchEventsUseCase_OnEvent_AddsAndBroadcasts(t *testing.T) {
	uc, _, store, rtSvc := makeWatchEventsUseCase(t)

	event := &kube.Event{
		Name:         "BackOff",
		Namespace:    "default",
		ResourceUID:  "pod-uid",
		LastObserved: time.Now(),
	}

	store.On("AddEvent", "pod-uid", *event, 72*time.Hour, 100).Return(true)
	rtSvc.On("Broadcast", mock.MatchedBy(func(msg realtime.Message) bool {
		return msg.Type == realtime.EVENT
	})).Return(nil)

	uc.onEvent(event)

	store.AssertExpectations(t)
	rtSvc.AssertExpectations(t)
}

func TestWatchEventsUseCase_OnEvent_SkipsDuplicate(t *testing.T) {
	uc, _, store, rtSvc := makeWatchEventsUseCase(t)

	event := &kube.Event{
		Name:         "BackOff",
		Namespace:    "default",
		ResourceUID:  "pod-uid",
		LastObserved: time.Now(),
	}

	store.On("AddEvent", "pod-uid", *event, 72*time.Hour, 100).Return(false)

	uc.onEvent(event)

	rtSvc.AssertNotCalled(t, "Broadcast")
}
