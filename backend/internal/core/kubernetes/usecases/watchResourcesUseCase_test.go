package kubernetesusecases

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/realtime"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func makeWatchResourcesUseCase(t *testing.T) (*WatchResourcesUseCase, *mocks.KubeService, *mocks.KubeStore, *mocks.RealtimeService) {
	kubeSvc := mocks.NewKubeService(t)
	store := mocks.NewKubeStore(t)
	rtSvc := mocks.NewRealtimeService(t)

	uc := NewWatchResourcesUseCase(rtSvc, kubeSvc, store).(*WatchResourcesUseCase)
	return uc, kubeSvc, store, rtSvc
}

func expectBroadcastPatch(rtSvc *mocks.RealtimeService, op string) {
	rtSvc.On("Broadcast", mock.MatchedBy(func(msg realtime.Message) bool {
		if msg.Type != realtime.RESOURCE_PATCH {
			return false
		}
		patch, ok := msg.Message.(realtime.ResourcePatch)
		return ok && patch.Op == op
	})).Return(nil).Maybe()
}

func TestWatchResources_onResourceAdd_UpdatesStore(t *testing.T) {
	uc, _, store, rtSvc := makeWatchResourcesUseCase(t)

	res := kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod"}
	store.On("UpdateResource", res).Return(&res)
	expectBroadcastPatch(rtSvc, realtime.PatchOpUpsert)

	uc.onResourceAdd(res)

	store.AssertCalled(t, "UpdateResource", res)
}

func TestWatchResources_onResourceUpdate_DeepEqual_Skips(t *testing.T) {
	uc, _, store, _ := makeWatchResourcesUseCase(t)

	res := kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod"}

	uc.onResourceUpdate(res, res)

	store.AssertNotCalled(t, "UpdateResource", mock.Anything)
}

func TestWatchResources_onResourceUpdate_Changed_Updates(t *testing.T) {
	uc, _, store, rtSvc := makeWatchResourcesUseCase(t)

	old := kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod", Status: kube.StatusPending}
	updated := kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod", Status: kube.StatusFailed}
	store.On("UpdateResource", updated).Return(&updated)
	expectBroadcastPatch(rtSvc, realtime.PatchOpUpsert)

	uc.onResourceUpdate(old, updated)

	store.AssertCalled(t, "UpdateResource", updated)
}

func TestWatchResources_onResourceDelete_Existing(t *testing.T) {
	uc, _, store, rtSvc := makeWatchResourcesUseCase(t)

	res := kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod"}
	store.On("GetResourceByUID", "pod-uid").Return(&res).Once()
	store.On("FindChildrenResourcesByRef", mock.Anything).Return([]kube.Resource{})
	store.On("RemoveResource", "pod-uid").Return()
	store.On("GetResourceByUID", "pod-uid").Return((*kube.Resource)(nil)).Once()
	expectBroadcastPatch(rtSvc, realtime.PatchOpDelete)

	uc.onResourceDelete(res)

	store.AssertCalled(t, "RemoveResource", "pod-uid")
}

func TestWatchResources_onResourceDelete_NonExistent(t *testing.T) {
	uc, _, store, _ := makeWatchResourcesUseCase(t)

	res := kube.Resource{UID: "missing-uid", Kind: "Pod", Name: "my-pod"}
	store.On("GetResourceByUID", "missing-uid").Return((*kube.Resource)(nil))

	uc.onResourceDelete(res)

	store.AssertNotCalled(t, "RemoveResource", mock.Anything)
}

func TestWatchResources_Execute_DiscoversApisAndWatches(t *testing.T) {
	uc, kubeSvc, _, _ := makeWatchResourcesUseCase(t)

	apis := []kube.ApiResource{{Name: "pods", Version: "v1", Group: "", Kind: "Pod"}}
	kubeSvc.On("DiscoverApis").Return(apis, nil)
	kubeSvc.On("WatchResources", apis, mock.Anything, mock.Anything, mock.Anything).Return()

	_, err := uc.Execute(WatchResourcesInput{})

	assert.NoError(t, err)
	kubeSvc.AssertCalled(t, "WatchResources", apis, mock.Anything, mock.Anything, mock.Anything)
}

func TestWatchResources_Execute_DiscoverApisError(t *testing.T) {
	uc, kubeSvc, _, _ := makeWatchResourcesUseCase(t)

	kubeSvc.On("DiscoverApis").Return(nil, errors.New("discovery failed"))

	_, err := uc.Execute(WatchResourcesInput{})

	assert.Error(t, err)
	kubeSvc.AssertNotCalled(t, "WatchResources", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestWatchResources_BroadcastsPatch(t *testing.T) {
	uc, _, store, rtSvc := makeWatchResourcesUseCase(t)

	res := kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod", Status: kube.StatusSuccess}
	store.On("UpdateResource", res).Return(&res)

	rtSvc.On("Broadcast", mock.MatchedBy(func(msg realtime.Message) bool {
		if msg.Type != realtime.RESOURCE_PATCH {
			return false
		}
		patch, ok := msg.Message.(realtime.ResourcePatch)
		return ok && patch.Op == realtime.PatchOpUpsert
	})).Return(nil)

	uc.onResourceAdd(res)

	rtSvc.AssertExpectations(t)
}
