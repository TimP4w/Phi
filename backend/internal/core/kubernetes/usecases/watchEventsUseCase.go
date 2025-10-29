package kubernetesusecases

import (
	"time"

	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
	"github.com/timp4w/phi/internal/core/tree"
	"github.com/timp4w/phi/internal/core/utils"
)

type WatchEventsInput struct{}

type WatchEventsUseCase struct {
	kubeService     kubernetes.KubeService
	treeService     tree.TreeService
	realtimeService realtime.RealtimeService
	rateLimiter     *utils.RateLimiter
	kubeStore       kubernetes.KubeStore
	logger          logging.PhiLogger
}

func NewWatchEventsUseCase(
	TreeService tree.TreeService,
	RealtimeService realtime.RealtimeService,
	KubeService kubernetes.KubeService,
	KubeStore kubernetes.KubeStore,
) shared.UseCase[WatchEventsInput, struct{}] {
	return &WatchEventsUseCase{
		treeService:     TreeService,
		realtimeService: RealtimeService,
		rateLimiter:     utils.NewRateLimiter(300 * time.Millisecond),
		kubeService:     KubeService,
		kubeStore:       KubeStore,
		logger:          *logging.Logger(),
	}
}

func (uc *WatchEventsUseCase) Execute(in WatchEventsInput) (struct{}, error) {
	uc.logger.Info("Starting events watcher use case")

	// Start the event watching in a separate goroutine with proper error handling
	go func() {
		uc.logger.Debug("Initializing event watcher goroutine")
		uc.kubeService.WatchEvents(uc.onEvent)
	}()

	return struct{}{}, nil
}

func (uc *WatchEventsUseCase) onEvent(event *kubernetes.Event) {
	logger := uc.logger.WithFields(map[string]any{
		"event_name":      event.Name,
		"event_kind":      event.Kind,
		"event_namespace": event.Namespace,
		"resource_uid":    event.ResourceUID,
		"reason":          event.Reason,
		"message":         event.Message,
		"event_type":      event.Type,
		"first_observed":  event.FirstObserved,
		"last_observed":   event.LastObserved,
		"count":           event.Count,
	})

	logger.Debug("Processing event")

	resource := uc.kubeStore.GetResourceByUID(string(event.ResourceUID))
	if resource == nil {
		logger.Warn("Resource not found for event - resource may not be tracked or event is stale")
		return
	}

	// Check if we already have this event to avoid duplicates
	for _, existingEvent := range resource.Events {
		if existingEvent.Name == event.Name && existingEvent.LastObserved.Equal(event.LastObserved) {
			logger.Debug("Event already exists for resource, skipping duplicate")
			return
		}
	}

	resource.Events = append(resource.Events, *event)
	logger.WithFields(map[string]any{
		"resource_name":      resource.Name,
		"resource_kind":      resource.Kind,
		"resource_namespace": resource.Namespace,
		"total_events":       len(resource.Events),
	}).Debug("Added event to resource")

	message := realtime.Message{
		Message: event,
		Type:    realtime.EVENT,
	}

	logger.Debug("Broadcasting event via realtime service")
	uc.realtimeService.Broadcast(message)
}
