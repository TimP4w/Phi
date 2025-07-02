package kubernetesusecases

import (
	"fmt"

	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"

	shared "github.com/timp4w/phi/internal/core/shared"
)

type ResumeUseCase struct {
	fluxService kubernetes.FluxService
	kubeStore   kubernetes.KubeStore
	logger      logging.PhiLogger
}

type ResumeUseCaseInput struct {
	UID string
}

func NewResumeUseCase(FluxService kubernetes.FluxService, KubeStore kubernetes.KubeStore) shared.UseCase[ResumeUseCaseInput, struct{}] {
	return &ResumeUseCase{
		fluxService: FluxService,
		kubeStore:   KubeStore,
		logger:      *logging.Logger(),
	}
}

func (uc *ResumeUseCase) Execute(input ResumeUseCaseInput) (struct{}, error) {
	logger := uc.logger.WithField(string(logging.ResourceUID), input.UID)

	el := uc.kubeStore.GetResourceByUID(input.UID)
	if el == nil {
		logger.Warn("Resource not found")
		return struct{}{}, fmt.Errorf("resource with uid %s not found", input.UID)
	}
	_, err := uc.fluxService.Resume(*el)
	if err != nil {
		logger.WithError(err).Warn("Failed to resume resource")
		return struct{}{}, fmt.Errorf("failed to resume resource: %v", err)
	}

	// Optimistically update resource state
	el.FluxMetadata.IsSuspended = false
	logger.Debug("Resource optimistically resumed")
	return struct{}{}, nil
}
