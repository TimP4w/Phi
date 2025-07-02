package kubernetesusecases

import (
	"fmt"

	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"

	shared "github.com/timp4w/phi/internal/core/shared"
)

type SuspendUseCase struct {
	fluxService kubernetes.FluxService
	kubeStore   kubernetes.KubeStore
	logger      logging.PhiLogger
}

type SuspendUseCaseInput struct {
	UID string
}

func NewSuspendUseCase(FluxService kubernetes.FluxService, KubeStore kubernetes.KubeStore) shared.UseCase[SuspendUseCaseInput, struct{}] {
	return &SuspendUseCase{
		fluxService: FluxService,
		kubeStore:   KubeStore,
		logger:      *logging.Logger(),
	}
}

func (uc *SuspendUseCase) Execute(input SuspendUseCaseInput) (struct{}, error) {
	logger := uc.logger.WithField(string(logging.ResourceUID), input.UID)
	el := uc.kubeStore.GetResourceByUID(input.UID)
	if el == nil {
		logger.Warn("Resource not found")
		return struct{}{}, fmt.Errorf("resource with uid %s not found", input.UID)
	}
	_, err := uc.fluxService.Suspend(*el)
	if err != nil {
		logger.WithError(err).Warn("Failed to suspend resource")
		return struct{}{}, fmt.Errorf("failed to suspend resource: %v", err)
	}

	// Optimistically update resource state
	el.FluxMetadata.IsSuspended = true
	logger.Debug("Resource optimistically suspended")
	return struct{}{}, nil
}
