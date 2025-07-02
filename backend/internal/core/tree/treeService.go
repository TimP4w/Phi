package tree

import (
	kube "github.com/timp4w/phi/internal/core/kubernetes"
)

type TreeService interface {
	// GetTree returns the current tree. If the tree is nil, it returns nil.
	GetTree() *Tree
	// GetUniqueResourceAPIRefs returns a map of unique resource API references in the tree.
	// The keys are formatted as "resource_version_group", e.g., "pods_v1_core".
	GetUniqueResourceAPIRefs() map[string]struct{}
	// FindNodeByUID searches for a node in the tree by its UID.
	FindNodeByUID(uid string) *kube.Resource
	// SetTree sets the root of the tree to the provided resource.
	SetTree(root kube.Resource)
}
