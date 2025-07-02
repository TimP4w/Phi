package kubernetesusecases

import (
	"context"
	"fmt"
	"time"

	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
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
	logger          logging.PhiLogger
}

type WatchLogsUseCaseInput struct {
	ClientID   string
	ResourceID string
}

func NewWatchLogsUseCase(
	TreeService tree.TreeService,
	RealtimeService realtime.RealtimeService,
	KubeService kubernetes.KubeService,
	KubeStore kubernetes.KubeStore,
) shared.UseCase[WatchLogsUseCaseInput, struct{}] {
	return &WatchLogsUseCase{
		treeService:     TreeService,
		realtimeService: RealtimeService,
		rateLimiter:     utils.NewRateLimiter(300 * time.Millisecond),
		watchers:        make(map[string]context.CancelFunc),
		kubeService:     KubeService,
		kubeStore:       KubeStore,
		logger:          *logging.Logger(),
	}
}

func (uc *WatchLogsUseCase) Execute(in WatchLogsUseCaseInput) (struct{}, error) {
	logger := uc.logger.WithFields(map[string]any{
		"client_id":   in.ClientID,
		"resource_id": in.ResourceID,
	})

	logger.Debug("Client subscribed to logs")

	cancel, exists := uc.watchers[in.ClientID]
	if exists {
		logger.Debug("Client was already subscribed to logs, canceling previous subscription")
		cancel()
	}

	ctx, cancel := context.WithCancel(context.Background())
	uc.watchers[in.ClientID] = cancel

	listener := realtime.Listener{
		ID: in.ClientID,
		OnClose: func(clientID string) {
			if clientID == in.ClientID {
				logger.Debug("Cancelled log subscription")
				cancel()
			}
		},
	}
	uc.realtimeService.AddConnectionListener(listener)

	pod := uc.kubeStore.GetResourceByUID(in.ResourceID)
	if pod == nil {
		logger.Error("Resource not found")
		return struct{}{}, fmt.Errorf("resource not found")
	}
	if pod.Kind != "Pod" {
		logger.WithField("kind", pod.Kind).Error("Resource is not a pod")
		return struct{}{}, fmt.Errorf("resource is not a pod")
	}

	logger.WithFields(map[string]any{
		"pod_name":      pod.Name,
		"pod_namespace": pod.Namespace,
	}).Info("Starting log watch")

	go uc.kubeService.WatchLogs(*pod, ctx, func(logEntry kubernetes.KubeLog) {
		uc.onLog(in.ResourceID, logEntry)
	})

	return struct{}{}, nil
}

func (uc *WatchLogsUseCase) onLog(uid string, log kubernetes.KubeLog) error {
	message := LogMessage{
		UID:       uid,
		Timestamp: log.Timestamp,
		Log:       log.Message,
		Container: log.Container,
	}

	uc.logger.
		WithField("resource_id", uid).
		WithField("container", log.Container).
		Debug("Received log entry")

	uc.realtimeService.Broadcast(realtime.Message{
		Type:    realtime.LOG,
		Message: message,
	})
	return nil
}

type LogMessage struct {
	Log       string    `json:"log"`
	UID       string    `json:"uid"`
	Container string    `json:"container"`
	Timestamp time.Time `json:"timestamp"`
}
