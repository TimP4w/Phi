package treeusecases

import (
	"errors"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	shared "github.com/timp4w/phi/internal/core/shared"
	"github.com/timp4w/phi/internal/core/tree"
	"go.uber.org/fx"
)

type GetTreeInput struct{}

type GetTreeUseCase struct {
	treeService tree.TreeService
}

type GetTreeUseCaseParams struct {
	fx.In
	TreeService tree.TreeService
}

func NewGetTreeUseCase(p GetTreeUseCaseParams) shared.UseCase[GetTreeInput, *kube.Resource] {
	return &GetTreeUseCase{
		treeService: p.TreeService,
	}
}

func (uc *GetTreeUseCase) Execute(in GetTreeInput) (*kube.Resource, error) {
	logger := logging.Logger()

	tree := uc.treeService.GetTree()
	if tree == nil {
		logger.Warn("tree is nil")
		return nil, errors.New("tree is nil")
	}

	return &tree.Root, nil
}
