package kubernetesusecases

import (
	"time"

	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
)

const (
	eventTTL             = 72 * time.Hour
	maxEventsPerResource = 100
)

type WatchEventsInput struct{}

type WatchEventsUseCase struct {
	kubeService     kubernetes.KubeService
	realtimeService realtime.RealtimeService
	kubeStore       kubernetes.KubeStore
	logger          logging.PhiLogger
}

func NewWatchEventsUseCase(
	RealtimeService realtime.RealtimeService,
	KubeService kubernetes.KubeService,
	KubeStore kubernetes.KubeStore,
) shared.UseCase[WatchEventsInput, struct{}] {
	return &WatchEventsUseCase{
		realtimeService: RealtimeService,
		kubeService:     KubeService,
		kubeStore:       KubeStore,
		logger:          *logging.Logger(),
	}
}

func (uc *WatchEventsUseCase) Execute(in WatchEventsInput) (struct{}, error) {
	uc.logger.Info("Starting events watcher use case")
	uc.kubeService.WatchEvents(uc.onEvent)
	return struct{}{}, nil
}

func (uc *WatchEventsUseCase) onEvent(event *kubernetes.Event) {
	logger := uc.logger.WithFields(map[string]any{
		"event_name":      event.Name,
		"event_kind":      event.Kind,
		"event_namespace": event.Namespace,
		"resource_uid":    event.ResourceUID,
	})

	logger.Debug("Processing event")
	added := uc.kubeStore.AddEvent(string(event.ResourceUID), *event, eventTTL, maxEventsPerResource)
	if !added {
		logger.Debug("Did not add event (duplicate or stale)")
		return
	}

	logger.Debug("Broadcasting event via realtime service")
	uc.realtimeService.Broadcast(realtime.Message{
		Message: event,
		Type:    realtime.EVENT,
	})
}
