package kubernetesusecases

import (
	"time"

	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
	"github.com/timp4w/phi/internal/core/tree"
	"github.com/timp4w/phi/internal/core/utils"
)

type WatchEventsUseCase struct {
	kubeService     kubernetes.KubeService
	treeService     tree.TreeService
	realtimeService realtime.RealtimeService
	rateLimiter     *utils.RateLimiter
	kubeStore       kubernetes.KubeStore
}

func NewWatchEventsUseCase() shared.UseCase[struct{}, struct{}] {
	return &WatchEventsUseCase{
		treeService:     shared.GetTreeService(),
		realtimeService: shared.GetRealtimeService(),
		rateLimiter:     utils.NewRateLimiter(300 * time.Millisecond),
		kubeService:     shared.GetKubeService(),
		kubeStore:       shared.GetKubeStore(),
	}
}

func (uc *WatchEventsUseCase) Execute(in struct{}) (struct{}, error) {
	uc.kubeService.WatchEvents(uc.onEvent)

	return struct{}{}, nil
}

func (uc *WatchEventsUseCase) onEvent(event *kubernetes.Event) {
	resource := uc.kubeStore.GetResourceByUID(string(event.ResourceUID))
	if resource == nil {
		// log.Printf("Resource %s [%s] not found for Event", event.Name, event.Kind)
		return
	}
	resource.Events = append(resource.Events, *event)

	message := realtime.Message{
		Message: event,
		Type:    realtime.EVENT,
	}
	uc.realtimeService.Broadcast(message)
}
