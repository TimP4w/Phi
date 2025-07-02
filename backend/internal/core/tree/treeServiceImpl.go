package tree

import (
	"sync"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
)

type TreeServiceImpl struct {
	tree *Tree
	mu   sync.RWMutex
}

func NewTreeService() TreeService {
	logger := logging.Logger()
	logger.Debug("Creating new TreeServiceImpl")
	return &TreeServiceImpl{
		tree: nil,
		mu:   sync.RWMutex{},
	}
}

var _ TreeService = (*TreeServiceImpl)(nil)

func (treeService *TreeServiceImpl) GetTree() *Tree {
	treeService.mu.Lock()
	defer treeService.mu.Unlock()
	logger := logging.Logger()
	if treeService.tree == nil {
		logger.Warn("Tree is nil in GetTree")
	}
	return treeService.tree
}

func (treeService *TreeServiceImpl) SetTree(root kube.Resource) {
	treeService.mu.Lock()
	defer treeService.mu.Unlock()
	logger := logging.Logger().WithFields(map[string]interface{}{
		"root_kind":      root.Kind,
		"root_name":      root.Name,
		"root_namespace": root.Namespace,
		"root_uid":       root.UID,
	})
	logger.Debug("Setting new tree root")
	treeService.tree = NewTree(root)
}

func (treeService *TreeServiceImpl) FindNodeByUID(uid string) *kube.Resource {
	treeService.mu.Lock()
	defer treeService.mu.Unlock()
	logger := logging.Logger().WithField("uid", uid)
	if treeService.tree == nil {
		logger.Warn("Tree is nil in FindNodeByUID")
		return nil
	}
	node := treeService.findNodeByUIDRecursive(&treeService.tree.Root, uid)
	if node == nil {
		logger.WithField(string(logging.ResourceUID), uid).Debug("Node not found in tree")
	}
	return node
}

// findNodeByUIDRecursive recursively searches (traversing the tree) for a node by UID starting from a given node.
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

func (treeService *TreeServiceImpl) GetUniqueResourceAPIRefs() map[string]struct{} {
	treeService.mu.Lock()
	defer treeService.mu.Unlock()
	logger := logging.Logger()
	resourcesMap := make(map[string]struct{})
	if treeService.tree == nil {
		logger.Warn("Tree is nil")
		return resourcesMap
	}
	treeService.collectUniqueResources(treeService.tree.Root, resourcesMap)
	logger.WithField("count", len(resourcesMap)).Debug("Collected unique resources")
	return resourcesMap

}

func (treeService *TreeServiceImpl) collectUniqueResources(node kube.Resource, resources map[string]struct{}) {
	encodedResource := node.Resource + "_" + node.Version + "_" + node.Group
	resources[encodedResource] = struct{}{}
	for _, child := range node.Children {
		treeService.collectUniqueResources(child, resources)
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
