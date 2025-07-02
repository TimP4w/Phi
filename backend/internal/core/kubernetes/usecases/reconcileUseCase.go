package kubernetesusecases

import (
	"fmt"

	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"

	shared "github.com/timp4w/phi/internal/core/shared"
)

type ReconcileInput struct {
	ResourceUid string
}

type ReconcileUseCase struct {
	fluxService kubernetes.FluxService
	kubeStore   kubernetes.KubeStore
	logger      logging.PhiLogger
}

func NewReconcileUseCase(FluxService kubernetes.FluxService, KubeStore kubernetes.KubeStore) shared.UseCase[ReconcileInput, struct{}] {
	return &ReconcileUseCase{
		fluxService: FluxService,
		kubeStore:   KubeStore,
		logger:      *logging.Logger(),
	}
}

func (uc *ReconcileUseCase) Execute(in ReconcileInput) (struct{}, error) {
	logger := uc.logger.WithField(string(logging.ResourceUID), in.ResourceUid)

	el := uc.kubeStore.GetResourceByUID(in.ResourceUid)
	if el == nil {
		logger.Warn("Resource not found")
		return struct{}{}, fmt.Errorf("resource with uid %s not found", in.ResourceUid)
	}
	_, err := uc.fluxService.Reconcile(*el)
	if err != nil {
		logger.WithError(err).Warn("Failed to reconcile resource")
		return struct{}{}, fmt.Errorf("failed to reconcile resource: %v", err)
	}

	// Optimistically update resource state
	el.FluxMetadata.IsReconciling = true
	logger.Debug("Resource optimistically reconciled")
	return struct{}{}, nil
}
