package kubernetesusecases

import (
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type GetEventsInput struct{}

type GetEventsUseCase struct {
	kubeService kube.KubeService
	logger      logging.PhiLogger
}

func NewGetEventsUseCase(KubeService kube.KubeService) shared.UseCase[GetEventsInput, []kube.Event] {
	return &GetEventsUseCase{
		kubeService: KubeService,
		logger:      *logging.Logger(),
	}
}

func (uc *GetEventsUseCase) Execute(in GetEventsInput) ([]kube.Event, error) {

	events, err := uc.kubeService.GetEvents()
	if err != nil {
		uc.logger.WithError(err).Error("Error while fetching events")
		return nil, err
	}

	uc.logger.WithField("count", len(events)).Debug("Returning cluster events")
	return events, nil
}
