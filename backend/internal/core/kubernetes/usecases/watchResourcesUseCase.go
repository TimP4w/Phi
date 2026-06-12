package kubernetesusecases

import (
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type WatchResourcesInput struct{}

type WatchResourcesUseCase struct {
	kubeService     kube.KubeService
	realtimeService realtime.RealtimeService
	kubeStore       kube.KubeStore
	logger          logging.PhiLogger
}

func NewWatchResourcesUseCase(
	RealtimeService realtime.RealtimeService,
	KubeService kube.KubeService,
	KubeStore kube.KubeStore,
) shared.UseCase[WatchResourcesInput, struct{}] {
	return &WatchResourcesUseCase{
		realtimeService: RealtimeService,
		kubeService:     KubeService,
		kubeStore:       KubeStore,
		logger:          *logging.Logger(),
	}
}

// Execute discovers the cluster's API resources and starts informers for all of
// them. The informers' initial sync populates the store.
func (uc *WatchResourcesUseCase) Execute(in WatchResourcesInput) (struct{}, error) {
	uc.logger.Info("Starting resources watcher")

	apis, err := uc.kubeService.DiscoverApis()
	if err != nil {
		uc.logger.WithError(err).Error("Error discovering cluster APIs")
		return struct{}{}, err
	}
	uc.logger.WithField("count", len(apis)).Debug("Setting up resource watchers")

	uc.kubeService.WatchResources(apis, uc.onResourceAdd, uc.onResourceUpdate, uc.onResourceDelete)
	return struct{}{}, nil
}

func (uc *WatchResourcesUseCase) onResourceAdd(el kube.Resource) {
	logger := uc.logger.WithFields(map[string]interface{}{
		"resource_kind":      el.Kind,
		"resource_name":      el.Name,
		"resource_namespace": el.Namespace,
		"resource_uid":       el.UID,
	})
	logger.Debug("Resource added")

	updated := uc.kubeStore.UpdateResource(el)
	uc.broadcastPatch(realtime.PatchOpUpsert, updated)
}

func (uc *WatchResourcesUseCase) onResourceUpdate(oldEl, newEl kube.Resource) {
	logger := uc.logger.WithFields(map[string]interface{}{
		"resource_kind":      newEl.Kind,
		"resource_name":      newEl.Name,
		"resource_namespace": newEl.Namespace,
		"resource_uid":       newEl.UID,
	})
	logger.Debug("Resource updated")

	if newEl.IsDeepEqual(oldEl) {
		return
	}

	updated := uc.kubeStore.UpdateResource(newEl)
	uc.broadcastPatch(realtime.PatchOpUpsert, updated)
}

func (uc *WatchResourcesUseCase) onResourceDelete(el kube.Resource) {
	logger := uc.logger.WithFields(map[string]interface{}{
		"resource_kind":      el.Kind,
		"resource_name":      el.Name,
		"resource_namespace": el.Namespace,
		"resource_uid":       el.UID,
	})
	logger.Debug("Resource deleted")

	existing := uc.kubeStore.GetResourceByUID(el.UID)
	if existing == nil {
		logger.Warn("Attempted to delete resource that doesn't exist in store")
		return
	}

	childCount := len(uc.kubeStore.FindChildrenResourcesByRef(el.GetRef()))
	if childCount > 0 {
		logger.WithField("child_count", childCount).Info("Removing resource with children")
	}

	uc.kubeStore.RemoveResource(el.UID)

	if uc.kubeStore.GetResourceByUID(el.UID) != nil {
		logger.Error("Resource removal failed - resource still exists in store")
		return
	}

	logger.Debug("Resource successfully removed from store")
	uc.broadcastPatch(realtime.PatchOpDelete, &el)
}

func (uc *WatchResourcesUseCase) broadcastPatch(op string, resource *kube.Resource) {
	uc.realtimeService.Broadcast(realtime.Message{
		Type: realtime.RESOURCE_PATCH,
		Message: realtime.ResourcePatch{
			Op:       op,
			Resource: resource,
		},
	})
}
