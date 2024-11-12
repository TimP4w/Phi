package kubernetesusecases

import (
	"fmt"

	"github.com/timp4w/phi/internal/core/kubernetes"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type GetResourceYAMLUseCase struct {
	kubeService kubernetes.KubeService
	kubeStore   kubernetes.KubeStore
}

func NewGetResourceYAMlUseCase() shared.UseCase[string, []byte] {
	return &GetResourceYAMLUseCase{
		kubeService: shared.GetKubeService(),
		kubeStore:   shared.GetKubeStore(),
	}
}

func (uc *GetResourceYAMLUseCase) Execute(uid string) ([]byte, error) {
	resource := uc.kubeStore.GetResourceByUID(uid)

	if resource == nil {
		return nil, fmt.Errorf("resource not found")
	}

	yaml, err := uc.kubeService.GetResourceYAML(*resource)
	if err != nil {
		return nil, err
	}
	return yaml, nil
}
