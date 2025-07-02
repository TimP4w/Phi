package controllers

import (
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
	input := kubernetesusecases.WatchLogsUseCaseInput{
		ClientID:   message.ClientId,
		ResourceID: message.Message.(string),
	}
	rc.watchLogsUseCase.Execute(input)
}
