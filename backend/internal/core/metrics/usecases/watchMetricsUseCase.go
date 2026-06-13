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

	// Subscription channels. Each view subscribes on its own channel so they
	// coexist on one connection; these must match the frontend MetricsChannel
	// union (web/src/core/metrics/usecases/watchMetrics.usecase.ts).
	ChannelTree      = "tree"      // per-resource sparklines in the tree view
	ChannelDashboard = "dashboard" // aggregate + node usage on the dashboard
	ChannelDetail    = "detail"    // 24h detail series for one resource drawer

	tickInterval = 30 * time.Second
	queryTimeout = 20 * time.Second
	// minImmediateInterval rate-limits the on-subscribe payload so a client that
	// resubscribes rapidly (navigation, panel toggles, StrictMode remounts) does
	// not trigger a fresh Prometheus query burst per message — the 30s ticker
	// covers it once an immediate serve has run recently.
	minImmediateInterval = 5 * time.Second
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

type metricsStoragePayload struct {
	Usages map[string]metrics.StorageUsage `json:"usages"`
}

type metricsResourcePayload struct {
	UID     string                  `json:"uid"`
	Metrics metrics.ResourceMetrics `json:"metrics"`
}

type WatchMetricsUseCase struct {
	metricsService  metrics.MetricsService
	realtimeService realtime.RealtimeService
	logger          *logging.PhiLogger

	mu            sync.Mutex
	subs          map[string]map[string]subscription // clientID -> channel -> sub
	listening     map[string]bool                    // clients with an OnClose listener
	lastServed    map[string]time.Time               // last time each client was served
	tickerRunning bool                               // a polling goroutine is live
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
		lastServed:      make(map[string]time.Time),
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
	doImmediate := time.Since(uc.lastServed[in.ClientID]) >= minImmediateInterval
	if doImmediate {
		uc.lastServed[in.ClientID] = time.Now()
	}
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
				delete(uc.lastServed, clientID)
				uc.mu.Unlock()
				// Drop our listener so the manager's listener map does not
				// accumulate a permanent entry per connection.
				uc.realtimeService.RemoveConnectionListener("metrics-" + clientID)
			},
		})
	}

	logger.Debug("Metrics subscription started")

	// Initial payload off the WS read goroutine (Prometheus Status() + I/O can
	// take seconds); the shared ticker then drives subsequent updates. Skipped
	// when this client was served recently, so a resubscribe burst coalesces.
	if doImmediate {
		clientID, channel := in.ClientID, in.Channel
		go func() {
			status := uc.metricsService.Status()
			uc.serveClient(clientID, map[string]subscription{channel: sub}, status, nil)
		}()
	}
	uc.ensureTicker()
	return struct{}{}, nil
}

// ensureTicker starts the polling goroutine if one is not already running. The
// goroutine stops itself once there are no subscriptions left, and a later
// subscribe restarts it — so an idle process holds no ticker.
func (uc *WatchMetricsUseCase) ensureTicker() {
	uc.mu.Lock()
	if uc.tickerRunning {
		uc.mu.Unlock()
		return
	}
	uc.tickerRunning = true
	uc.mu.Unlock()

	go func() {
		t := time.NewTicker(tickInterval)
		defer t.Stop()
		for range t.C {
			if !uc.tick() {
				return
			}
		}
	}()
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

// tick serves every subscribed client once. It returns false when there are no
// subscriptions left, signalling the polling goroutine to stop.
func (uc *WatchMetricsUseCase) tick() bool {
	uc.mu.Lock()
	if len(uc.subs) == 0 {
		uc.tickerRunning = false
		uc.mu.Unlock()
		return false
	}
	uc.mu.Unlock()

	subs := uc.snapshot()
	// Probe the integration once per tick rather than once per client.
	status := uc.metricsService.Status()
	// detailCache dedupes GetResourceMetrics across clients within one tick.
	detailCache := newDetailCache()

	// Fan out per client: each serveClient does blocking Prometheus I/O, so a
	// slow or numerous client set must not serialise everyone behind it.
	var wg sync.WaitGroup
	for clientID, chans := range subs {
		wg.Add(1)
		go func(clientID string, chans map[string]subscription) {
			defer wg.Done()
			uc.serveClient(clientID, chans, status, detailCache)
		}(clientID, chans)
	}
	wg.Wait()

	now := time.Now()
	uc.mu.Lock()
	for clientID := range subs {
		if _, live := uc.subs[clientID]; live {
			uc.lastServed[clientID] = now
		}
	}
	uc.mu.Unlock()
	return true
}

// detailCache memoises GetResourceMetrics by UID within a tick. Safe for the
// concurrent serveClient goroutines.
type detailCache struct {
	mu sync.Mutex
	m  map[string]*metrics.ResourceMetrics
}

func newDetailCache() *detailCache { return &detailCache{m: map[string]*metrics.ResourceMetrics{}} }

func (d *detailCache) get(uid string) (*metrics.ResourceMetrics, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	rm, ok := d.m[uid]
	return rm, ok
}

func (d *detailCache) set(uid string, rm *metrics.ResourceMetrics) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.m[uid] = rm
}

// serveClient pushes status + data for one client's subscriptions. The status
// is passed in so it is probed once per tick, not once per client.
func (uc *WatchMetricsUseCase) serveClient(clientID string, chans map[string]subscription, status metrics.IntegrationStatus, cache *detailCache) {
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

		storage, err := uc.metricsService.GetStorageUsage(ctx, uids)
		if err != nil {
			uc.logger.WithError(err).Warn("Failed to fetch storage usage")
		} else if len(storage) > 0 {
			uc.send(clientID, realtime.METRICS_STORAGE, metricsStoragePayload{Usages: storage})
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
		if sub.channel != ChannelDetail || sub.uid == "" {
			continue
		}
		var rm *metrics.ResourceMetrics
		if cache != nil {
			rm, _ = cache.get(sub.uid)
		}
		if rm == nil {
			fetched, err := uc.metricsService.GetResourceMetrics(ctx, sub.uid)
			if err != nil {
				uc.logger.WithError(err).WithField("uid", sub.uid).Warn("Failed to fetch resource metrics")
				continue
			}
			rm = &fetched
			if cache != nil {
				cache.set(sub.uid, rm)
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
