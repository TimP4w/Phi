package tree

import (
	kube "github.com/timp4w/phi/internal/core/kubernetes"
)

type TreeService interface {
	GetTree() *Tree
	GetUniqueKinds() map[string]struct{}
	FindNodeByUID(uid string) *kube.Resource
	SetTree(root kube.Resource)
}
