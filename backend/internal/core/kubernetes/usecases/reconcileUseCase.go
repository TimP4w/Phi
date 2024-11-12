package kubernetesusecases

import (
	"fmt"

	"github.com/timp4w/phi/internal/core/kubernetes"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type ReconcileUseCase struct {
	kubeService kubernetes.KubeService
	kubeStore   kubernetes.KubeStore
}

func NewReconcileUseCase() shared.UseCase[string, struct{}] {
	return &ReconcileUseCase{
		kubeService: shared.GetKubeService(),
		kubeStore:   shared.GetKubeStore(),
	}
}

func (uc *ReconcileUseCase) Execute(in string) (struct{}, error) {
	el := uc.kubeStore.GetResourceByUID(in)
	if el == nil {
		return struct{}{}, fmt.Errorf("resource with uid %s not found", in)
	}
	_, err := uc.kubeService.Reconcile(*el)
	if err != nil {
		return struct{}{}, fmt.Errorf("failed to reconcile resource: %v", err)
	}

	// Optimistically update resource state
	el.FluxMetadata.IsReconciling = true
	return struct{}{}, nil
}
