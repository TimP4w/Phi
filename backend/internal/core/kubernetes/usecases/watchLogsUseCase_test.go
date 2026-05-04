package kubernetesusecases

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/realtime"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func makeWatchLogsUseCase(t *testing.T) (*WatchLogsUseCase, *mocks.KubeService, *mocks.KubeStore, *mocks.RealtimeService) {
	kubeSvc := mocks.NewKubeService(t)
	store := mocks.NewKubeStore(t)
	rtSvc := mocks.NewRealtimeService(t)
	treeSvc := mocks.NewTreeService(t)

	uc := NewWatchLogsUseCase(treeSvc, rtSvc, kubeSvc, store).(*WatchLogsUseCase)
	return uc, kubeSvc, store, rtSvc
}

func TestWatchLogsUseCase_ResourceNotFound(t *testing.T) {
	uc, _, store, rtSvc := makeWatchLogsUseCase(t)

	store.On("GetResourceByUID", "missing").Return((*kube.Resource)(nil))
	rtSvc.On("AddConnectionListener", mock.Anything).Return()

	_, err := uc.Execute(WatchLogsUseCaseInput{ClientID: "c1", ResourceID: "missing"})

	assert.ErrorContains(t, err, "resource not found")
}

func TestWatchLogsUseCase_NotAPod(t *testing.T) {
	uc, _, store, rtSvc := makeWatchLogsUseCase(t)

	res := &kube.Resource{UID: "deploy-uid", Kind: "Deployment"}
	store.On("GetResourceByUID", "deploy-uid").Return(res)
	rtSvc.On("AddConnectionListener", mock.Anything).Return()

	_, err := uc.Execute(WatchLogsUseCaseInput{ClientID: "c1", ResourceID: "deploy-uid"})

	assert.ErrorContains(t, err, "not a pod")
}

func TestWatchLogsUseCase_Success(t *testing.T) {
	uc, kubeSvc, store, rtSvc := makeWatchLogsUseCase(t)

	pod := &kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod", Namespace: "default"}
	store.On("GetResourceByUID", "pod-uid").Return(pod)
	rtSvc.On("AddConnectionListener", mock.Anything).Return()

	started := make(chan struct{})
	kubeSvc.On("WatchLogs", *pod, mock.Anything, mock.Anything).
		Run(func(args mock.Arguments) {
			close(started)
			ctx := args.Get(1).(context.Context)
			<-ctx.Done()
		}).
		Return(nil)

	_, err := uc.Execute(WatchLogsUseCaseInput{ClientID: "c1", ResourceID: "pod-uid"})
	require.NoError(t, err)

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("WatchLogs goroutine did not start")
	}
}

func TestWatchLogsUseCase_CancelsPreviousSubscription(t *testing.T) {
	uc, kubeSvc, store, rtSvc := makeWatchLogsUseCase(t)

	pod := &kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod", Namespace: "default"}
	store.On("GetResourceByUID", "pod-uid").Return(pod)
	rtSvc.On("AddConnectionListener", mock.Anything).Return()

	firstStarted := make(chan struct{})
	firstCancelled := make(chan struct{})
	secondStarted := make(chan struct{})

	kubeSvc.On("WatchLogs", *pod, mock.Anything, mock.Anything).
		Once().
		Run(func(args mock.Arguments) {
			close(firstStarted)
			ctx := args.Get(1).(context.Context)
			<-ctx.Done()
			close(firstCancelled)
		}).
		Return(nil)

	kubeSvc.On("WatchLogs", *pod, mock.Anything, mock.Anything).
		Once().
		Run(func(args mock.Arguments) {
			close(secondStarted)
			ctx := args.Get(1).(context.Context)
			<-ctx.Done()
		}).
		Return(nil)

	_, err := uc.Execute(WatchLogsUseCaseInput{ClientID: "c1", ResourceID: "pod-uid"})
	require.NoError(t, err)

	// Ensure first goroutine is running before triggering second Execute
	select {
	case <-firstStarted:
	case <-time.After(time.Second):
		t.Fatal("first subscription did not start")
	}

	_, err = uc.Execute(WatchLogsUseCaseInput{ClientID: "c1", ResourceID: "pod-uid"})
	require.NoError(t, err)

	select {
	case <-firstCancelled:
	case <-time.After(time.Second):
		t.Fatal("first subscription was not cancelled")
	}

	select {
	case <-secondStarted:
	case <-time.After(time.Second):
		t.Fatal("second subscription did not start")
	}
}

func TestWatchLogsUseCase_OnLog_Broadcasts(t *testing.T) {
	uc, _, _, rtSvc := makeWatchLogsUseCase(t)

	rtSvc.On("Broadcast", mock.MatchedBy(func(msg realtime.Message) bool {
		return msg.Type == realtime.LOG
	})).Return(nil)

	uc.onLog("pod-uid", kube.KubeLog{
		Message:   "hello world",
		Container: "main",
		Timestamp: time.Now(),
	})

	rtSvc.AssertExpectations(t)
}
