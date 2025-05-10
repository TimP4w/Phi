package tree

import (
	"sync"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
)

type Tree struct {
	mu   sync.RWMutex
	Root kube.Resource `json:"root"`
}

func NewTree(rootNode kube.Resource) *Tree {
	return &Tree{
		Root: rootNode,
		mu:   sync.RWMutex{},
	}
}
