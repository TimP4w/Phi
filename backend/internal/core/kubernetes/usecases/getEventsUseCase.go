package kubernetesusecases

import (
	"github.com/timp4w/phi/internal/core/kubernetes"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type GetEventsUseCase struct {
	kubeService kubernetes.KubeService
}

func NewGetEventsUseCase() shared.UseCase[struct{}, []kube.Event] {
	return &GetEventsUseCase{
		kubeService: shared.GetKubeService(),
	}
}

func (uc *GetEventsUseCase) Execute(in struct{}) ([]kube.Event, error) {
	events, err := uc.kubeService.GetEvents()
	if err != nil {
		return nil, err
	}
	return events, nil
}
