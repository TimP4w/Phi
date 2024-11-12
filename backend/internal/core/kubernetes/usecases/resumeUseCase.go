package kubernetesusecases

import (
	"fmt"

	"github.com/timp4w/phi/internal/core/kubernetes"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type ResumeUseCase struct {
	kubeService kubernetes.KubeService
	kubeStore   kubernetes.KubeStore
}

type ResumeUseCaseInput struct {
	UID string
}

func NewResumeUseCase() shared.UseCase[ResumeUseCaseInput, struct{}] {
	return &ResumeUseCase{
		kubeService: shared.GetKubeService(),
		kubeStore:   shared.GetKubeStore(),
	}
}

func (uc *ResumeUseCase) Execute(input ResumeUseCaseInput) (struct{}, error) {
	el := uc.kubeStore.GetResourceByUID(input.UID)
	if el == nil {
		return struct{}{}, fmt.Errorf("resource with uid %s not found", input.UID)
	}
	_, err := uc.kubeService.Resume(*el)
	if err != nil {
		return struct{}{}, fmt.Errorf("failed to suspend resource: %v", err)
	}

	// Optimistically update resource state
	el.FluxMetadata.IsSuspended = false
	return struct{}{}, nil
}
