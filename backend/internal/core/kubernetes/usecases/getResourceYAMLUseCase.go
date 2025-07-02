package kubernetesusecases

import (
	"fmt"

	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type GetResourceYAMLInput struct {
	ResourceUid string
}

type GetResourceYAMLUseCase struct {
	kubeService kubernetes.KubeService
	kubeStore   kubernetes.KubeStore
	logger      logging.PhiLogger
}

func NewGetResourceYAMlUseCase(KubeService kubernetes.KubeService, KubeStore kubernetes.KubeStore) shared.UseCase[GetResourceYAMLInput, []byte] {
	return &GetResourceYAMLUseCase{
		kubeService: KubeService,
		kubeStore:   KubeStore,
		logger:      *logging.Logger(),
	}
}

func (uc *GetResourceYAMLUseCase) Execute(in GetResourceYAMLInput) ([]byte, error) {
	logger := uc.logger.WithField(string(logging.ResourceUID), in.ResourceUid)

	resource := uc.kubeStore.GetResourceByUID(in.ResourceUid)

	logger.Debug("Getting YAML description for resource")

	if resource == nil {
		logger.Error("Could not find resource")
		return nil, fmt.Errorf("resource not found")
	}

	yaml, err := uc.kubeService.GetResourceYAML(*resource)
	if err != nil {
		return nil, err
	}
	return yaml, nil
}
