package controllers

import (
	"github.com/timp4w/phi/internal/core/logging"
	kubernetesusecases "github.com/timp4w/phi/internal/core/kubernetes/usecases"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type ResourceWSController struct {
	watchLogsUseCase shared.UseCase[kubernetesusecases.WatchLogsUseCaseInput, struct{}]
}

func NewResourceWSController(
	watchLogsUseCase shared.UseCase[kubernetesusecases.WatchLogsUseCaseInput, struct{}],
	realtimeService realtime.RealtimeService, // Injected
) *ResourceWSController {
	controller := ResourceWSController{
		watchLogsUseCase: watchLogsUseCase,
	}

	realtimeService.RegisterListener(realtime.MessageListener{
		Type:      realtime.START_WATCH_LOGS,
		OnMessage: controller.HandleWatchLogs,
	})

	return &controller
}

func (rc *ResourceWSController) HandleWatchLogs(message realtime.Message) {
	resourceID, ok := message.Message.(string)
	if !ok || resourceID == "" {
		logging.Logger().
			WithField("client_id", message.ClientId).
			Warn("Ignoring watch-logs message with invalid payload")
		return
	}
	rc.watchLogsUseCase.Execute(kubernetesusecases.WatchLogsUseCaseInput{
		ClientID:   message.ClientId,
		ResourceID: resourceID,
	})
}
