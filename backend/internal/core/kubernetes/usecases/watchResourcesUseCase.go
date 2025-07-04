package kubernetesusecases

import (
	"time"

	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"

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
	prevTree        kube.Resource
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
		prevTree:        kube.Resource{},
	}
}

func (uc *WatchResourcesUseCase) Execute(in WatchResourcesInput) (struct{}, error) {
	uc.logger.Info("Starting resources watcher")

	uniqueKinds := uc.treeService.GetUniqueResourceAPIRefs()
	uc.logger.WithField("count", len(uniqueKinds)).Debug("Setting up resource watchers")

	uc.kubeService.WatchResources(uniqueKinds, uc.onResourceAdd, uc.onResourceUpdate, uc.onResourceDelete)
	return struct{}{}, nil
}

func (uc *WatchResourcesUseCase) rebuildTreeAtNode(el kube.Resource) {
	logger := uc.logger.WithFields(map[string]interface{}{
		"resource_kind":      el.Kind,
		"resource_name":      el.Name,
		"resource_namespace": el.Namespace,
	})
	logger.Debug("Rebuilding tree")

	tree := uc.treeService.GetTree()
	uc.prevTree = tree.Root

	root := tree.Root
	visited := make(map[string]bool)
	visited[root.GetRef()] = true
	root.Children = []kube.Resource{}
	uc.findChildrenRec(&root, visited)

	// Create new informers if needed
	uniqueResources := uc.treeService.GetUniqueResourceAPIRefs()
	channels := uc.kubeService.GetInformerChannels()
	for resourceKey := range uniqueResources {
		if _, ok := channels[resourceKey]; !ok {
			logger.WithField("resourceKey", resourceKey).Debug("Creating new informer for resource")
			uc.kubeService.WatchResources(map[string]struct{}{resourceKey: {}}, uc.onResourceAdd, uc.onResourceUpdate, uc.onResourceDelete)
		}
	}

	uc.treeService.SetTree(root)

	var treeOperations []TreeOperation
	DiffTrees(&uc.prevTree, &root, &treeOperations)

	for _, treeOperation := range treeOperations {
		treeOperation.Resource.Children = nil
		if treeOperation.OldResource != nil {
			treeOperation.OldResource.Children = nil
		}
		msg := realtime.Message{
			Type:    string(treeOperation.Type),
			Message: treeOperation,
		}

		uc.rateLimiter.Execute(func() {
			uc.realtimeService.Broadcast(msg)
		}, "BroadcastTreeOperation_"+treeOperation.Resource.UID)
	}
	uc.prevTree = root
	/*
	   compressedTree, err := uc.compressTree(&root)

	   	if err != nil {
	   		logger.WithError(err).Error("Error compressing tree")
	   		return
	   	}

	   	 message := realtime.Message{
	   		Message: compressedTree,
	   		Type:    realtime.TREE,
	   	}

	   logger.Debug("Broadcasting updated tree")
	   uc.realtimeService.Broadcast(message)
	*/
}

// TreeOperationType represents the type of operation performed on a tree node.
type TreeOperationType string

const (
	ResourceAdd    TreeOperationType = "ADD_RESOURCE"
	ResourceUpdate TreeOperationType = "UPDATE_RESOURCE"
	ResourceDelete TreeOperationType = "DELETE_RESOURCE"
)

type TreeOperation struct {
	Type        TreeOperationType `json:"type"`
	Resource    kube.Resource     `json:"resource"`
	OldResource *kube.Resource    `json:"oldResource,omitempty"`
}

// DiffTrees recursively compares old and new trees and returns treeOperations
func DiffTrees(oldNode, newNode *kube.Resource, treeOperations *[]TreeOperation) {
	if oldNode == nil && newNode != nil {
		*treeOperations = append(*treeOperations, TreeOperation{Type: ResourceAdd, Resource: *newNode})
		for i := range newNode.Children {
			DiffTrees(nil, &newNode.Children[i], treeOperations)
		}
		return
	}
	if oldNode != nil && newNode == nil {
		*treeOperations = append(*treeOperations, TreeOperation{Type: ResourceDelete, Resource: *oldNode})
		for i := range oldNode.Children {
			DiffTrees(&oldNode.Children[i], nil, treeOperations)
		}
		return
	}
	if oldNode != nil && newNode != nil {
		if oldNode.UID != newNode.UID {
			*treeOperations = append(*treeOperations, TreeOperation{Type: ResourceDelete, Resource: *oldNode})
			*treeOperations = append(*treeOperations, TreeOperation{Type: ResourceAdd, Resource: *newNode})
		} else if !oldNode.DeepEqual(*newNode) {
			*treeOperations = append(*treeOperations, TreeOperation{Type: ResourceUpdate, Resource: *newNode, OldResource: oldNode})
		}
		// Map children by UID for comparison
		oldChildren := make(map[string]*kube.Resource)
		for i := range oldNode.Children {
			oldChildren[oldNode.Children[i].UID] = &oldNode.Children[i]
		}
		newChildren := make(map[string]*kube.Resource)
		for i := range newNode.Children {
			newChildren[newNode.Children[i].UID] = &newNode.Children[i]
		}
		// Check for added/updated children
		for uid, newChild := range newChildren {
			DiffTrees(oldChildren[uid], newChild, treeOperations)
		}
		// Check for deleted children
		for uid, oldChild := range oldChildren {
			if _, found := newChildren[uid]; !found {
				DiffTrees(oldChild, nil, treeOperations)
			}
		}
	}
}

func (uc *WatchResourcesUseCase) findChildrenRec(root *kube.Resource, visited map[string]bool) *kube.Resource {
	children := uc.kubeStore.FindChildrenResourcesByRef(root.GetRef())
	for _, child := range children {
		if !visited[child.GetRef()] {
			visited[child.GetRef()] = true
			root.Children = append(root.Children, *uc.findChildrenRec(&child, visited))
		}
	}
	return root
}

// compressTree compresses the Tree (that can be several megabytes in size) it before sending it to the client
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

	addedEl := uc.kubeStore.UpdateResource(el)
	uc.rateLimiter.Execute(func() {
		uc.rebuildTreeAtNode(*addedEl)
	}, "RebuildTree")
}

func (uc *WatchResourcesUseCase) onResourceUpdate(oldEl, newEl kube.Resource) {
	logger := uc.logger.WithFields(map[string]interface{}{
		"resource_kind":      newEl.Kind,
		"resource_name":      newEl.Name,
		"resource_namespace": newEl.Namespace,
		"resource_uid":       newEl.UID,
	})
	logger.Debug("Resource updated")

	updatedEl := uc.kubeStore.UpdateResource(newEl)
	uc.rateLimiter.Execute(func() {
		uc.rebuildTreeAtNode(*updatedEl)
	}, "RebuildTree")
}

func (uc *WatchResourcesUseCase) onResourceDelete(el kube.Resource) {
	logger := uc.logger.WithFields(map[string]interface{}{
		"resource_kind":      el.Kind,
		"resource_name":      el.Name,
		"resource_namespace": el.Namespace,
		"resource_uid":       el.UID,
	})
	logger.Debug("Resource deleted")

	uc.kubeStore.RemoveResource(el.UID)
	uc.rateLimiter.Execute(func() {
		uc.rebuildTreeAtNode(el)
	}, "RebuildTree")
}
