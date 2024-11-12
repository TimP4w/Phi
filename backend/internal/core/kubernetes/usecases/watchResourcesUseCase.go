package kubernetesusecases

import (
	"log"
	"time"

	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
	"github.com/timp4w/phi/internal/core/tree"
	"github.com/timp4w/phi/internal/core/utils"
)

type WatchResourcesUseCase struct {
	kubeService     kube.KubeService
	treeService     tree.TreeService
	realtimeService realtime.RealtimeService
	rateLimiter     *utils.RateLimiter
	kubeStore       kube.KubeStore
}

func NewWatchResourcesUseCase() shared.UseCase[struct{}, struct{}] {
	return &WatchResourcesUseCase{
		treeService:     shared.GetTreeService(),
		realtimeService: shared.GetRealtimeService(),
		rateLimiter:     utils.NewRateLimiter(150 * time.Millisecond),
		kubeService:     shared.GetKubeService(),
		kubeStore:       shared.GetKubeStore(),
	}
}

func (uc *WatchResourcesUseCase) Execute(in struct{}) (struct{}, error) {
	uniqueKinds := uc.treeService.GetUniqueKinds()
	uc.kubeService.WatchResources(uniqueKinds, uc.onResourceAdd, uc.onResourceUpdate, uc.onResourceDelete)
	return struct{}{}, nil
}

func (uc *WatchResourcesUseCase) rebuildTreeAtNode(el kube.Resource) {
	tree := uc.treeService.GetTree()
	root := tree.Root
	visited := make(map[string]bool)
	visited[root.GetRef()] = true
	root.Children = []kube.Resource{}
	uc.findChildrenRec(&root, visited)

	// Create new informers if needed
	uniqueResources := uc.treeService.GetUniqueKinds()
	channels := uc.kubeService.GetInformerChannels()
	for kind := range uniqueResources {
		if _, ok := channels[kind]; !ok {
			uc.kubeService.WatchResources(map[string]struct{}{kind: {}}, uc.onResourceAdd, uc.onResourceUpdate, uc.onResourceDelete)
		}
	}

	uc.treeService.SetTree(root)
	compressedTree, err := compressTree(&root)
	if err != nil {
		log.Println("Error compressing tree", err)
		return
	}
	message := realtime.Message{
		Message: compressedTree,
		Type:    realtime.TREE,
	}
	uc.realtimeService.Broadcast(message)

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

// Tree can be several megabytes in size, so we compress it before sending it to the client
func compressTree(tree *kube.Resource) (string, error) {
	res, err := json.Marshal(tree)
	if err != nil {
		return "", err
	}

	var compressed bytes.Buffer
	gz := gzip.NewWriter(&compressed)
	if _, err := gz.Write([]byte(res)); err != nil {
		return "", err
	}
	if err := gz.Close(); err != nil {
		return "", err
	}

	// Encode to base64
	return base64.StdEncoding.EncodeToString(compressed.Bytes()), nil
}

func (uc *WatchResourcesUseCase) onResourceAdd(el kube.Resource) {
	addedEl := uc.kubeStore.UpdateResource(el)
	uc.rateLimiter.Execute(func() {
		uc.rebuildTreeAtNode(*addedEl)
	})
}

func (uc *WatchResourcesUseCase) onResourceUpdate(oldEl, newEl kube.Resource) {
	updatedEl := uc.kubeStore.UpdateResource(newEl)
	uc.rateLimiter.Execute(func() {
		uc.rebuildTreeAtNode(*updatedEl)
	})
}

func (uc *WatchResourcesUseCase) onResourceDelete(el kube.Resource) {
	uc.kubeStore.RemoveResource(el.UID)
	uc.rateLimiter.Execute(func() {
		uc.rebuildTreeAtNode(el)
	})
}
