package kubernetesusecases

import (
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type SyncResourcesInput struct{}

type SyncResourcesUseCase struct {
	kubeService kube.KubeService
	kubeStore   kube.KubeStore
	logger      logging.PhiLogger
}

func NewSyncResourcesUseCase(
	kubeService kube.KubeService,
	kubeStore kube.KubeStore,
) shared.UseCase[SyncResourcesInput, map[string]*kube.Resource] {
	return &SyncResourcesUseCase{
		kubeService: kubeService,
		kubeStore:   kubeStore,
		logger:      *logging.Logger(),
	}
}

func (uc *SyncResourcesUseCase) Execute(in SyncResourcesInput) (map[string]*kube.Resource, error) {
	uc.logger.Info("Starting resource synchronization")

	rm, err := uc.kubeService.DiscoverApis()
	if err != nil {
		uc.logger.WithError(err).Error("Error finding APIs")
		return nil, err
	}

	resources, err := uc.kubeService.DiscoverResources(rm)
	if err != nil {
		uc.logger.WithError(err).Error("Error getting resources")
		return nil, err
	}

	uc.logger.WithField("resource_count", len(resources)).Info("Discovered resources")
	uc.kubeStore.SetResources(resources)

	for _, resource := range resources {
		uc.kubeStore.RegisterResource(resource)
	}

	uc.logger.Info("Resource synchronization completed")
	return resources, nil
}
