package kubernetesusecases

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/realtime"
	kubeTree "github.com/timp4w/phi/internal/core/tree"
	"github.com/timp4w/phi/internal/core/utils"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func makeWatchResourcesUseCase(t *testing.T) (*WatchResourcesUseCase, *mocks.KubeService, *mocks.KubeStore, *mocks.RealtimeService, *mocks.TreeService) {
	kubeSvc := mocks.NewKubeService(t)
	store := mocks.NewKubeStore(t)
	rtSvc := mocks.NewRealtimeService(t)
	treeSvc := mocks.NewTreeService(t)

	uc := NewWatchResourcesUseCase(treeSvc, rtSvc, kubeSvc, store).(*WatchResourcesUseCase)
	uc.rateLimiter = utils.NewRateLimiter(0)

	// Short-circuit rebuildTree in all tests by default
	treeSvc.On("GetTree").Return((*kubeTree.Tree)(nil)).Maybe()

	return uc, kubeSvc, store, rtSvc, treeSvc
}

func TestWatchResources_onResourceAdd_UpdatesStore(t *testing.T) {
	uc, _, store, _, _ := makeWatchResourcesUseCase(t)

	res := kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod"}
	store.On("UpdateResource", res).Return((*kube.Resource)(nil))

	uc.onResourceAdd(res)

	time.Sleep(10 * time.Millisecond)
	store.AssertCalled(t, "UpdateResource", res)
}

func TestWatchResources_onResourceUpdate_DeepEqual_Skips(t *testing.T) {
	uc, _, store, _, _ := makeWatchResourcesUseCase(t)

	res := kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod"}

	uc.onResourceUpdate(res, res)

	store.AssertNotCalled(t, "UpdateResource", mock.Anything)
}

func TestWatchResources_onResourceUpdate_Changed_Updates(t *testing.T) {
	uc, _, store, _, _ := makeWatchResourcesUseCase(t)

	old := kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod", Status: kube.StatusPending}
	new := kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod", Status: kube.StatusFailed}
	store.On("UpdateResource", new).Return((*kube.Resource)(nil))

	uc.onResourceUpdate(old, new)

	time.Sleep(10 * time.Millisecond)
	store.AssertCalled(t, "UpdateResource", new)
}

func TestWatchResources_onResourceDelete_Existing(t *testing.T) {
	uc, _, store, _, _ := makeWatchResourcesUseCase(t)

	res := kube.Resource{UID: "pod-uid", Kind: "Pod", Name: "my-pod"}
	store.On("GetResourceByUID", "pod-uid").Return(&res).Once()
	store.On("FindChildrenResourcesByRef", mock.Anything).Return([]kube.Resource{})
	store.On("RemoveResource", "pod-uid").Return()
	store.On("GetResourceByUID", "pod-uid").Return((*kube.Resource)(nil)).Once()

	uc.onResourceDelete(res)

	time.Sleep(10 * time.Millisecond)
	store.AssertCalled(t, "RemoveResource", "pod-uid")
}

func TestWatchResources_onResourceDelete_NonExistent(t *testing.T) {
	uc, _, store, _, _ := makeWatchResourcesUseCase(t)

	res := kube.Resource{UID: "missing-uid", Kind: "Pod", Name: "my-pod"}
	store.On("GetResourceByUID", "missing-uid").Return((*kube.Resource)(nil))

	uc.onResourceDelete(res)

	store.AssertNotCalled(t, "RemoveResource", mock.Anything)
}

func TestWatchResources_Execute_CallsWatchResources(t *testing.T) {
	uc, kubeSvc, _, _, treeSvc := makeWatchResourcesUseCase(t)

	kinds := map[string]struct{}{"pods.v1": {}}
	treeSvc.On("GetUniqueResourceAPIRefs").Return(kinds)
	kubeSvc.On("WatchResources", kinds, mock.Anything, mock.Anything, mock.Anything).Return()

	_, err := uc.Execute(WatchResourcesInput{})

	assert.NoError(t, err)
	kubeSvc.AssertCalled(t, "WatchResources", kinds, mock.Anything, mock.Anything, mock.Anything)
}

func TestWatchResources_RebuildTree_BroadcastsTree(t *testing.T) {
	kubeSvc := mocks.NewKubeService(t)
	store := mocks.NewKubeStore(t)
	rtSvc := mocks.NewRealtimeService(t)
	treeSvc := mocks.NewTreeService(t)

	uc := NewWatchResourcesUseCase(treeSvc, rtSvc, kubeSvc, store).(*WatchResourcesUseCase)

	root := kube.Resource{UID: "root", Kind: "Namespace", Name: "flux-system"}
	treeSvc.On("GetTree").Return(&kubeTree.Tree{Root: root})
	store.On("FindChildrenResourcesByRef", mock.Anything).Return([]kube.Resource{})
	treeSvc.On("GetUniqueResourceAPIRefs").Return(map[string]struct{}{})
	kubeSvc.On("GetInformerChannels").Return(map[string]chan struct{}{})
	treeSvc.On("SetTree", mock.Anything).Return()
	rtSvc.On("Broadcast", mock.MatchedBy(func(msg realtime.Message) bool {
		return msg.Type == realtime.TREE
	})).Return(nil)

	uc.rebuildTree()

	rtSvc.AssertCalled(t, "Broadcast", mock.MatchedBy(func(msg realtime.Message) bool {
		return msg.Type == realtime.TREE
	}))
}
