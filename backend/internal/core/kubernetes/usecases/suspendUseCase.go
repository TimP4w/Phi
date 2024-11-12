package kubernetesusecases

import (
	"fmt"

	"github.com/timp4w/phi/internal/core/kubernetes"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type SuspendUseCase struct {
	kubeService kubernetes.KubeService
	kubeStore   kubernetes.KubeStore
}

type SuspendUseCaseInput struct {
	UID string
}

func NewSuspendUseCase() shared.UseCase[SuspendUseCaseInput, struct{}] {
	return &SuspendUseCase{
		kubeService: shared.GetKubeService(),
		kubeStore:   shared.GetKubeStore(),
	}
}

func (uc *SuspendUseCase) Execute(input SuspendUseCaseInput) (struct{}, error) {
	el := uc.kubeStore.GetResourceByUID(input.UID)
	if el == nil {
		return struct{}{}, fmt.Errorf("resource with uid %s not found", input.UID)
	}
	_, err := uc.kubeService.Suspend(*el)
	if err != nil {
		return struct{}{}, fmt.Errorf("failed to suspend resource: %v", err)
	}

	// Optimistically update resource state
	el.FluxMetadata.IsSuspended = true
	return struct{}{}, nil
}
