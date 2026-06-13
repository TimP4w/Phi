package controllers

import (
	"encoding/json"

	"github.com/timp4w/phi/internal/core/logging"
	metricsusecases "github.com/timp4w/phi/internal/core/metrics/usecases"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type MetricsWSController struct {
	watchMetricsUseCase shared.UseCase[metricsusecases.WatchMetricsInput, struct{}]
}

func NewMetricsWSController(
	watchMetricsUseCase shared.UseCase[metricsusecases.WatchMetricsInput, struct{}],
	realtimeService realtime.RealtimeService, // Injected
) *MetricsWSController {
	controller := MetricsWSController{
		watchMetricsUseCase: watchMetricsUseCase,
	}

	realtimeService.RegisterListener(realtime.MessageListener{
		Type:      realtime.START_WATCH_METRICS,
		OnMessage: controller.handle(metricsusecases.ActionStart),
	})
	realtimeService.RegisterListener(realtime.MessageListener{
		Type:      realtime.STOP_WATCH_METRICS,
		OnMessage: controller.handle(metricsusecases.ActionStop),
	})

	return &controller
}

func (mc *MetricsWSController) handle(action string) func(realtime.Message) {
	return func(message realtime.Message) {
		var input metricsusecases.WatchMetricsInput
		// message.Message arrives as map[string]any; round-trip through JSON
		// to fill the typed input.
		raw, err := json.Marshal(message.Message)
		if err == nil {
			err = json.Unmarshal(raw, &input)
		}
		// An empty channel would register a junk subscription the ticker
		// serves until disconnect (or no-op a STOP) — drop the message.
		if err != nil || input.Channel == "" {
			logging.Logger().
				WithError(err).
				WithField("client_id", message.ClientId).
				Warn("Ignoring metrics subscription message with invalid payload")
			return
		}
		input.ClientID = message.ClientId
		input.Action = action
		mc.watchMetricsUseCase.Execute(input)
	}
}
