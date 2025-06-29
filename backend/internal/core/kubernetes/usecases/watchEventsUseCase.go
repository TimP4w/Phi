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
	uc.logger.Info("Starting events watcher")
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

	resource := uc.kubeStore.GetResourceByUID(string(event.ResourceUID))
	if resource == nil {
		logger.Warn("Resource not found for event")
		return
	}

	resource.Events = append(resource.Events, *event)
	logger.Debug("Added event to resource")

	message := realtime.Message{
		Message: event,
		Type:    realtime.EVENT,
	}
	uc.realtimeService.Broadcast(message)
}
