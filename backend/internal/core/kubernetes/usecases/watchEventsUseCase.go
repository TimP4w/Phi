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
	const eventTTL = 72 * time.Hour  // TODO: make configurable
	const maxEventsPerResource = 100 // TODO: make configurable

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

	if time.Since(event.LastObserved) > eventTTL {
		logger.Debug("Event is older than TTL, skipping")
		return
	}

	// Check if we already have this event to avoid duplicates
	for _, existingEvent := range resource.Events {
		if existingEvent.Name == event.Name && existingEvent.LastObserved.Equal(event.LastObserved) {
			logger.Debug("Event already exists for resource, skipping duplicate")
			return
		}
	}

	// Clean up old events before adding new one
	resource.Events = uc.cleanupOldEvents(resource.Events)

	// Limit the number of events per resource
	if len(resource.Events) >= maxEventsPerResource {
		logger.Debug("Resource has reached max events limit, removing oldest")
		resource.Events = uc.removeOldestEvent(resource.Events)
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

// cleanupOldEvents removes events older than the TTL
func (uc *WatchEventsUseCase) cleanupOldEvents(events []kubernetes.Event) []kubernetes.Event {
	const eventTTL = 24 * time.Hour
	cutoffTime := time.Now().Add(-eventTTL)

	var validEvents []kubernetes.Event
	for _, event := range events {
		if event.LastObserved.After(cutoffTime) {
			validEvents = append(validEvents, event)
		}
	}

	if len(validEvents) != len(events) {
		uc.logger.WithFields(map[string]any{
			"removed_events":   len(events) - len(validEvents),
			"remaining_events": len(validEvents),
		}).Debug("Cleaned up old events")
	}

	return validEvents
}

// removeOldestEvent removes the oldest event from the slice
func (uc *WatchEventsUseCase) removeOldestEvent(events []kubernetes.Event) []kubernetes.Event {
	if len(events) == 0 {
		return events
	}

	oldestIndex := 0
	oldestTime := events[0].LastObserved

	for i, event := range events {
		if event.LastObserved.Before(oldestTime) {
			oldestIndex = i
			oldestTime = event.LastObserved
		}
	}

	return append(events[:oldestIndex], events[oldestIndex+1:]...)
}
