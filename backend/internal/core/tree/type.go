package tree

import (
	"sync"

	types "github.com/timp4w/phi/internal/core/kubernetes"
)

type Tree struct {
	mu   sync.RWMutex
	Root types.Resource `json:"root"`
}

func NewTree(rootNode types.Resource) *Tree {
	return &Tree{
		Root: rootNode,
		mu:   sync.RWMutex{},
	}
}
