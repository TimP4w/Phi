package realtimeusecases

import (
	"net/http"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
	"go.uber.org/fx"
)

type UpgradeConnectionUseCase struct {
	realtimeService realtime.RealtimeService
	logger          logging.PhiLogger
}

type UpgradeConnectionInput struct {
	W http.ResponseWriter
	R *http.Request
}

type UpgradeConnectionUseCaseParams struct {
	fx.In
	RealtimeService realtime.RealtimeService
	KubeStore       kube.KubeStore
}

func NewUpgradeConnectionUseCase(p UpgradeConnectionUseCaseParams) shared.UseCase[UpgradeConnectionInput, bool] {
	uc := &UpgradeConnectionUseCase{
		realtimeService: p.RealtimeService,
		logger:          *logging.Logger(),
	}

	// Register a global on-connect listener that sends the full resource state
	// to each newly connected client, replacing the need for an initial HTTP fetch.
	p.RealtimeService.AddConnectionListener(realtime.Listener{
		ID: "resource-sync-provider",
		OnConnect: func(clientId string) {
			resources := p.KubeStore.GetResources()
			resourceList := make([]kube.Resource, 0, len(resources))
			for _, r := range resources {
				resourceList = append(resourceList, r)
			}
			err := p.RealtimeService.SendMessage(realtime.Message{
				Type:     realtime.RESOURCE_SYNC,
				Message:  resourceList,
				ClientId: clientId,
			}, clientId)
			if err != nil {
				logging.Logger().WithClient(clientId).WithError(err).Error("Failed to send RESOURCE_SYNC")
			}
		},
	})

	return uc
}

func (uc *UpgradeConnectionUseCase) Execute(input UpgradeConnectionInput) (bool, error) {
	_, err := uc.realtimeService.Upgrade(input.W, input.R)
	if err != nil {
		uc.logger.WithError(err).Error("Error upgrading the connection")
		return false, err
	}
	return true, nil
}
