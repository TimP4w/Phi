package tree

import (
	"sync"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
)

type TreeServiceImpl struct {
	tree *Tree
	mu   sync.RWMutex
}

func NewTreeService() TreeService {
	return &TreeServiceImpl{
		tree: nil,
		mu:   sync.RWMutex{},
	}
}

var _ TreeService = (*TreeServiceImpl)(nil)

func (treeService *TreeServiceImpl) GetTree() *Tree {
	treeService.mu.Lock()
	defer treeService.mu.Unlock()
	return treeService.tree
}

func (treeService *TreeServiceImpl) SetTree(root kube.Resource) {
	treeService.mu.Lock()
	defer treeService.mu.Unlock()
	treeService.tree = NewTree(root)
}

func (treeService *TreeServiceImpl) FindNodeByUID(uid string) *kube.Resource {
	treeService.mu.Lock()
	defer treeService.mu.Unlock()
	return treeService.findNodeByUIDRecursive(&treeService.tree.Root, uid)
}

func (treeService *TreeServiceImpl) findNodeByUIDRecursive(node *kube.Resource, uid string) *kube.Resource {
	if node.UID == uid {
		return node
	}
	for _, child := range node.Children {
		foundNode := treeService.findNodeByUIDRecursive(&child, uid)
		if foundNode != nil {
			return foundNode
		}
	}
	return nil
}

func (treeService *TreeServiceImpl) GetUniqueKinds() map[string]struct{} {
	treeService.mu.Lock()
	defer treeService.mu.Unlock()
	kinds := make(map[string]struct{})
	treeService.collectUniqueKinds(treeService.tree.Root, kinds)
	return kinds

}

func (treeService *TreeServiceImpl) collectUniqueKinds(node kube.Resource, kinds map[string]struct{}) {
	resourceVersion := node.Resource + "_" + node.Version + "_" + node.Group
	kinds[resourceVersion] = struct{}{}
	for _, child := range node.Children {
		treeService.collectUniqueKinds(child, kinds)
	}
}

func contains(list []string, el string) bool {
	for _, e := range list {
		if e == el {
			return true
		}
	}
	return false
}
