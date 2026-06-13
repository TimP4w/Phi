package metricsusecases

import (
	"context"
	"sync"
	"time"

	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/metrics"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
)

const (
	ActionStart = "start"
	ActionStop  = "stop"

	tickInterval = 30 * time.Second
	queryTimeout = 20 * time.Second
)

// WatchMetricsInput carries both START and STOP subscription messages.
type WatchMetricsInput struct {
	ClientID string   `json:"-"`
	Action   string   `json:"-"`       // ActionStart | ActionStop
	Channel  string   `json:"channel"` // "tree" | "dashboard" | "detail"
	UIDs     []string `json:"uids"`
	Nodes    bool     `json:"nodes"`
	UID      string   `json:"uid"`
}

type subscription struct {
	channel string
	uids    []string
	nodes   bool
	uid     string
}

type metricsCurrentPayload struct {
	Usages map[string]metrics.CurrentUsage `json:"usages"`
}

type metricsResourcePayload struct {
	UID     string                  `json:"uid"`
	Metrics metrics.ResourceMetrics `json:"metrics"`
}

type WatchMetricsUseCase struct {
	metricsService  metrics.MetricsService
	realtimeService realtime.RealtimeService
	logger          *logging.PhiLogger

	mu         sync.Mutex
	subs       map[string]map[string]subscription // clientID -> channel -> sub
	listening  map[string]bool                    // clients with an OnClose listener
	tickerOnce sync.Once
}

func NewWatchMetricsUseCase(
	MetricsService metrics.MetricsService,
	RealtimeService realtime.RealtimeService,
) shared.UseCase[WatchMetricsInput, struct{}] {
	return newWatchMetricsUseCase(MetricsService, RealtimeService)
}

func newWatchMetricsUseCase(ms metrics.MetricsService, rt realtime.RealtimeService) *WatchMetricsUseCase {
	return &WatchMetricsUseCase{
		metricsService:  ms,
		realtimeService: rt,
		logger:          logging.Logger(),
		subs:            make(map[string]map[string]subscription),
		listening:       make(map[string]bool),
	}
}

func (uc *WatchMetricsUseCase) Execute(in WatchMetricsInput) (struct{}, error) {
	logger := uc.logger.WithFields(map[string]any{
		"client_id": in.ClientID,
		"channel":   in.Channel,
		"action":    in.Action,
	})

	if in.Action == ActionStop {
		uc.mu.Lock()
		if chans, ok := uc.subs[in.ClientID]; ok {
			delete(chans, in.Channel)
			if len(chans) == 0 {
				delete(uc.subs, in.ClientID)
			}
		}
		uc.mu.Unlock()
		logger.Debug("Metrics subscription stopped")
		return struct{}{}, nil
	}

	sub := subscription{channel: in.Channel, uids: in.UIDs, nodes: in.Nodes, uid: in.UID}

	uc.mu.Lock()
	if uc.subs[in.ClientID] == nil {
		uc.subs[in.ClientID] = make(map[string]subscription)
	}
	uc.subs[in.ClientID][in.Channel] = sub
	needListener := !uc.listening[in.ClientID]
	uc.listening[in.ClientID] = true
	uc.mu.Unlock()

	if needListener {
		clientID := in.ClientID
		uc.realtimeService.AddConnectionListener(realtime.Listener{
			// Namespaced so it does not overwrite the logs use case's listener,
			// which is keyed by the bare client ID in the same map. OnClose is
			// still invoked with the bare client ID, so the filter below works.
			ID: "metrics-" + clientID,
			OnClose: func(closedID string) {
				if closedID != clientID {
					return
				}
				uc.mu.Lock()
				delete(uc.subs, clientID)
				delete(uc.listening, clientID)
				uc.mu.Unlock()
			},
		})
	}

	logger.Debug("Metrics subscription started")

	// Initial payload off the WS read goroutine (Prometheus I/O can take
	// seconds); the shared ticker then drives subsequent updates.
	go uc.serveClient(in.ClientID, map[string]subscription{in.Channel: sub}, nil)
	uc.ensureTicker()
	return struct{}{}, nil
}

func (uc *WatchMetricsUseCase) ensureTicker() {
	uc.tickerOnce.Do(func() {
		go func() {
			t := time.NewTicker(tickInterval)
			defer t.Stop()
			for range t.C {
				uc.tick()
			}
		}()
	})
}

// snapshot returns a copy of the registry (also used by tests).
func (uc *WatchMetricsUseCase) snapshot() map[string]map[string]subscription {
	uc.mu.Lock()
	defer uc.mu.Unlock()
	out := make(map[string]map[string]subscription, len(uc.subs))
	for c, chans := range uc.subs {
		cp := make(map[string]subscription, len(chans))
		for k, v := range chans {
			cp[k] = v
		}
		out[c] = cp
	}
	return out
}

func (uc *WatchMetricsUseCase) tick() {
	subs := uc.snapshot()
	if len(subs) == 0 {
		return
	}
	// detailCache dedupes GetResourceMetrics across clients within one tick.
	detailCache := map[string]*metrics.ResourceMetrics{}
	for clientID, chans := range subs {
		uc.serveClient(clientID, chans, detailCache)
	}
}

// serveClient pushes status + data for one client's subscriptions.
func (uc *WatchMetricsUseCase) serveClient(clientID string, chans map[string]subscription, detailCache map[string]*metrics.ResourceMetrics) {
	status := uc.metricsService.Status()
	uc.send(clientID, realtime.METRICS_STATUS, status)
	if status.Status != metrics.IntegrationActive {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), queryTimeout)
	defer cancel()

	// Union of current-usage UIDs across tree + dashboard channels.
	uidSet := map[string]struct{}{}
	wantNodes := false
	for _, sub := range chans {
		for _, u := range sub.uids {
			uidSet[u] = struct{}{}
		}
		if sub.nodes {
			wantNodes = true
		}
	}
	if len(uidSet) > 0 {
		uids := make([]string, 0, len(uidSet))
		for u := range uidSet {
			uids = append(uids, u)
		}
		usages, err := uc.metricsService.GetCurrentUsage(ctx, uids)
		if err != nil {
			uc.logger.WithError(err).Warn("Failed to fetch current usage")
		} else {
			uc.send(clientID, realtime.METRICS_CURRENT, metricsCurrentPayload{Usages: usages})
		}
	}

	if wantNodes {
		nodes, err := uc.metricsService.GetNodeUsage(ctx)
		if err != nil {
			uc.logger.WithError(err).Warn("Failed to fetch node usage")
		} else {
			uc.send(clientID, realtime.METRICS_NODES, nodes)
		}
	}

	for _, sub := range chans {
		if sub.channel != "detail" || sub.uid == "" {
			continue
		}
		var rm *metrics.ResourceMetrics
		if detailCache != nil {
			rm = detailCache[sub.uid]
		}
		if rm == nil {
			fetched, err := uc.metricsService.GetResourceMetrics(ctx, sub.uid)
			if err != nil {
				uc.logger.WithError(err).WithField("uid", sub.uid).Warn("Failed to fetch resource metrics")
				continue
			}
			rm = &fetched
			if detailCache != nil {
				detailCache[sub.uid] = rm
			}
		}
		uc.send(clientID, realtime.METRICS_RESOURCE, metricsResourcePayload{UID: sub.uid, Metrics: *rm})
	}
}

func (uc *WatchMetricsUseCase) send(clientID, msgType string, payload any) {
	if err := uc.realtimeService.SendMessage(realtime.Message{Type: msgType, Message: payload}, clientID); err != nil {
		uc.logger.WithError(err).WithField("client_id", clientID).Debug("Failed to send metrics message")
	}
}
