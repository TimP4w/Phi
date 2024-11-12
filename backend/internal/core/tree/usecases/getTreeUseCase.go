package treeusecases

import (
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	shared "github.com/timp4w/phi/internal/core/shared"
	"github.com/timp4w/phi/internal/core/tree"
)

type GetTreeUseCase struct {
	treeService tree.TreeService
}

func NewGetTreeUseCase() shared.UseCase[struct{}, *kube.Resource] {
	return &GetTreeUseCase{
		treeService: shared.GetTreeService(),
	}
}

func (uc *GetTreeUseCase) Execute(in struct{}) (*kube.Resource, error) {
	return &uc.treeService.GetTree().Root, nil
}
