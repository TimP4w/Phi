package kubernetesusecases

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
	"github.com/timp4w/phi/internal/core/tree"
	"github.com/timp4w/phi/internal/core/utils"
)

type WatchLogsUseCase struct {
	kubeService     kubernetes.KubeService
	treeService     tree.TreeService
	realtimeService realtime.RealtimeService
	rateLimiter     *utils.RateLimiter
	watchers        map[string]context.CancelFunc // TODO: move to kubernetes service
	kubeStore       kubernetes.KubeStore
}

type WatchLogsUseCaseInput struct {
	ClientID   string
	ResourceID string
}

func NewWatchLogsUseCase() shared.UseCase[WatchLogsUseCaseInput, struct{}] {
	return &WatchLogsUseCase{
		treeService:     shared.GetTreeService(),
		realtimeService: shared.GetRealtimeService(),
		rateLimiter:     utils.NewRateLimiter(300 * time.Millisecond),
		watchers:        make(map[string]context.CancelFunc),
		kubeService:     shared.GetKubeService(),
		kubeStore:       shared.GetKubeStore(),
	}
}

func (uc *WatchLogsUseCase) Execute(in WatchLogsUseCaseInput) (struct{}, error) {
	log.Println(fmt.Sprintf("Client: %s wants to subscribe to logs for resource %s", in.ClientID, in.ResourceID))

	cancel, exists := uc.watchers[in.ClientID]
	if exists {
		log.Println(fmt.Sprintf("Client: %s was already subscribed to receive logs from a resource. Will cancel current subscription.", in.ClientID, in.ResourceID))
		cancel()
	}

	ctx, cancel := context.WithCancel(context.Background())
	uc.watchers[in.ClientID] = cancel

	listener := realtime.Listener{
		ID: in.ClientID,
		OnClose: func(clientID string) {
			if clientID == in.ClientID {
				log.Println(fmt.Sprintf("Cancelled log subscription for client: %s and resource %s.", in.ClientID, in.ResourceID))
				cancel()
			}
		},
	}
	uc.realtimeService.AddConnectionListener(listener)

	pod := uc.kubeStore.GetResourceByUID(in.ResourceID)
	if pod == nil {
		return struct{}{}, fmt.Errorf("resource not found")
	}
	if pod.Kind != "Pod" {
		return struct{}{}, fmt.Errorf("resource is not a pod")
	}

	go uc.kubeService.WatchLogs(*pod, ctx, func(log kubernetes.KubeLog) {
		uc.onLog(in.ResourceID, log)
	})

	return struct{}{}, nil
}

func (uc *WatchLogsUseCase) onLog(uid string, log kubernetes.KubeLog) error {
	uc.realtimeService.Broadcast(realtime.Message{
		Type: realtime.LOG,
		Message: LogMessage{
			UID:       uid,
			Timestamp: log.Timestamp,
			Log:       log.Message,
			Container: log.Container,
		},
	})
	return nil
}

type LogMessage struct {
	Log       string    `json:"log"`
	UID       string    `json:"uid"`
	Container string    `json:"container"`
	Timestamp time.Time `json:"timestamp"`
}
