package kubernetesusecases

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"time"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
	"github.com/timp4w/phi/internal/core/tree"
	"github.com/timp4w/phi/internal/core/utils"
)

type WatchResourcesInput struct{}

type WatchResourcesUseCase struct {
	kubeService     kube.KubeService
	treeService     tree.TreeService
	realtimeService realtime.RealtimeService
	rateLimiter     *utils.RateLimiter
	kubeStore       kube.KubeStore
	logger          logging.PhiLogger
}

func NewWatchResourcesUseCase(
	TreeService tree.TreeService,
	RealtimeService realtime.RealtimeService,
	KubeService kube.KubeService,
	KubeStore kube.KubeStore,
) shared.UseCase[WatchResourcesInput, struct{}] {
	return &WatchResourcesUseCase{
		treeService:     TreeService,
		realtimeService: RealtimeService,
		rateLimiter:     utils.NewRateLimiter(1500 * time.Millisecond), // TODO: make configurable, maybe store in a DB and also make it editable via UI
		kubeService:     KubeService,
		kubeStore:       KubeStore,
		logger:          *logging.Logger(),
	}
}

func (uc *WatchResourcesUseCase) Execute(in WatchResourcesInput) (struct{}, error) {
	uc.logger.Info("Starting resources watcher")

	uniqueKinds := uc.treeService.GetUniqueResourceAPIRefs()
	uc.logger.WithField("count", len(uniqueKinds)).Debug("Setting up resource watchers")

	uc.kubeService.WatchResources(uniqueKinds, uc.onResourceAdd, uc.onResourceUpdate, uc.onResourceDelete)
	return struct{}{}, nil
}

func (uc *WatchResourcesUseCase) rebuildTree() {
	logger := uc.logger
	logger.Debug("Rebuilding tree")

	tree := uc.treeService.GetTree()
	if tree == nil {
		logger.Warn("Tree is nil")
		return
	}

	root := tree.Root
	rootKey := root.UID
	visited := map[string]bool{rootKey: true}
	root = uc.findChildrenRec(root, visited)

	// Create new informers if needed
	uniqueResources := uc.treeService.GetUniqueResourceAPIRefs()
	channels := uc.kubeService.GetInformerChannels()
	for resourceKey := range uniqueResources {
		if _, channelExists := channels[resourceKey]; !channelExists {
			logger.WithField("resourceKey", resourceKey).Debug("Creating new informer for resource")
			uc.kubeService.WatchResources(
				map[string]struct{}{resourceKey: {}},
				uc.onResourceAdd,
				uc.onResourceUpdate,
				uc.onResourceDelete,
			)
		}
	}

	uc.treeService.SetTree(root)
	compressedTree, err := uc.compressTree(&root)
	if err != nil {
		logger.WithError(err).Error("Error compressing tree")
		return
	}

	uc.realtimeService.Broadcast(realtime.Message{
		Message: compressedTree,
		Type:    realtime.TREE,
	})
}

func (uc *WatchResourcesUseCase) findChildrenRec(root kube.Resource, visited map[string]bool) kube.Resource {
	children := uc.kubeStore.FindChildrenResourcesByRef(root.GetRef())
	root.Children = nil
	for i := range children {
		child := children[i]
		key := child.UID
		if visited[key] {
			continue
		}
		visited[key] = true
		child = uc.findChildrenRec(child, visited)
		root.Children = append(root.Children, child)
	}
	return root
}

// compressTree compresses the Tree (that can be several megabytes in size) before sending it to the client.
func (uc *WatchResourcesUseCase) compressTree(tree *kube.Resource) (string, error) {
	res, err := json.Marshal(tree)
	if err != nil {
		uc.logger.WithError(err).Error("Failed to marshal tree")
		return "", err
	}

	uc.logger.WithField("uncompressed_size", len(res)).Debug("Compressing tree")

	var compressed bytes.Buffer
	gz := gzip.NewWriter(&compressed) // TODO: gzip.NewWriterLevel(&compressed, gzip.BestSpeed) or gzip.BestCompression
	if _, err := gz.Write([]byte(res)); err != nil {
		uc.logger.WithError(err).Error("Failed to compress tree")
		return "", err
	}
	if err := gz.Close(); err != nil {
		uc.logger.WithError(err).Error("Failed to close gzip writer")
		return "", err
	}

	// Encode to base64
	encoded := base64.StdEncoding.EncodeToString(compressed.Bytes())
	uc.logger.WithFields(map[string]interface{}{
		"compressed_size":   compressed.Len(),
		"encoded_size":      len(encoded),
		"compression_ratio": float64(len(res)) / float64(compressed.Len()),
	}).Debug("Tree compressed and encoded")

	return encoded, nil
}

func (uc *WatchResourcesUseCase) onResourceAdd(el kube.Resource) {
	logger := uc.logger.WithFields(map[string]interface{}{
		"resource_kind":      el.Kind,
		"resource_name":      el.Name,
		"resource_namespace": el.Namespace,
		"resource_uid":       el.UID,
	})
	logger.Debug("Resource added")

	uc.kubeStore.UpdateResource(el)
	uc.rateLimiter.Execute(func() { uc.rebuildTree() }, "RebuildTree")
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
		// Avoid flooding by checking if there were meaningful changes
		return
	}

	uc.kubeStore.UpdateResource(newEl)
	uc.rateLimiter.Execute(func() { uc.rebuildTree() }, "RebuildTree")
}

func (uc *WatchResourcesUseCase) onResourceDelete(el kube.Resource) {
	logger := uc.logger.WithFields(map[string]interface{}{
		"resource_kind":      el.Kind,
		"resource_name":      el.Name,
		"resource_namespace": el.Namespace,
		"resource_uid":       el.UID,
	})
	logger.Debug("Resource deleted")

	// Verify the resource exists before trying to remove it
	existingResource := uc.kubeStore.GetResourceByUID(el.UID)
	if existingResource == nil {
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
	} else {
		logger.Debug("Resource successfully removed from store")
	}

	uc.rateLimiter.Execute(func() { uc.rebuildTree() }, "RebuildTree")
}
