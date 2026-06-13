package metricsusecases

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/timp4w/phi/internal/core/metrics"
	"github.com/timp4w/phi/internal/core/realtime"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func activeStatus() metrics.IntegrationStatus {
	return metrics.IntegrationStatus{Name: "prometheus", Status: metrics.IntegrationActive}
}

func newUC(t *testing.T) (*WatchMetricsUseCase, *mocks.MetricsService, *mocks.RealtimeService) {
	ms := mocks.NewMetricsService(t)
	rt := mocks.NewRealtimeService(t)
	rt.On("AddConnectionListener", mock.Anything).Maybe()
	uc := newWatchMetricsUseCase(ms, rt)
	return uc, ms, rt
}

// recorder captures messages sent to clients in a goroutine-safe way, since the
// initial subscription payload is served on its own goroutine.
type recorder struct {
	mu       sync.Mutex
	messages []realtime.Message
}

func (r *recorder) record(args mock.Arguments) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.messages = append(r.messages, args.Get(0).(realtime.Message))
}

func (r *recorder) typesSeen() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]string, 0, len(r.messages))
	for _, m := range r.messages {
		out = append(out, m.Type)
	}
	return out
}

func (r *recorder) countOf(msgType string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := 0
	for _, m := range r.messages {
		if m.Type == msgType {
			n++
		}
	}
	return n
}

func TestSubscribeSendsInitialData(t *testing.T) {
	uc, ms, rt := newUC(t)
	ms.On("Status").Return(activeStatus())
	ms.On("GetCurrentUsage", mock.Anything, []string{"u1"}).
		Return(map[string]metrics.CurrentUsage{"u1": {}}, nil)
	ms.On("GetStorageUsage", mock.Anything, mock.Anything).
		Return(map[string]metrics.StorageUsage{}, nil).Maybe()

	rec := &recorder{}
	rt.On("SendMessage", mock.Anything, "client1").Run(rec.record).Return(nil)

	_, err := uc.Execute(WatchMetricsInput{
		ClientID: "client1", Action: ActionStart, Channel: "tree", UIDs: []string{"u1"},
	})
	assert.NoError(t, err)

	assert.Eventually(t, func() bool {
		seen := rec.typesSeen()
		return contains(seen, realtime.METRICS_STATUS) && contains(seen, realtime.METRICS_CURRENT)
	}, time.Second, 5*time.Millisecond)
}

func TestSubscribeInactiveSendsOnlyStatus(t *testing.T) {
	uc, ms, rt := newUC(t)
	ms.On("Status").Return(metrics.IntegrationStatus{Name: "prometheus", Status: metrics.IntegrationDisabled})

	rec := &recorder{}
	rt.On("SendMessage", mock.Anything, "client1").Run(rec.record).Return(nil)

	uc.Execute(WatchMetricsInput{ClientID: "client1", Action: ActionStart, Channel: "tree", UIDs: []string{"u1"}})

	// Exactly one message (STATUS) is sent when the integration is inactive.
	assert.Eventually(t, func() bool { return rec.countOf(realtime.METRICS_STATUS) == 1 }, time.Second, 5*time.Millisecond)
	assert.Equal(t, 0, rec.countOf(realtime.METRICS_CURRENT))
}

func TestStopRemovesSubscription(t *testing.T) {
	uc, ms, rt := newUC(t)
	ms.On("Status").Return(activeStatus()).Maybe()
	ms.On("GetCurrentUsage", mock.Anything, mock.Anything).Return(map[string]metrics.CurrentUsage{}, nil).Maybe()
	ms.On("GetStorageUsage", mock.Anything, mock.Anything).Return(map[string]metrics.StorageUsage{}, nil).Maybe()
	rt.On("SendMessage", mock.Anything, "client1").Return(nil).Maybe()

	uc.Execute(WatchMetricsInput{ClientID: "client1", Action: ActionStart, Channel: "tree", UIDs: []string{"u1"}})
	uc.Execute(WatchMetricsInput{ClientID: "client1", Action: ActionStop, Channel: "tree"})

	assert.Empty(t, uc.snapshot())
}

func TestTickFansOutPerChannel(t *testing.T) {
	uc, ms, rt := newUC(t)
	ms.On("Status").Return(activeStatus())
	ms.On("GetCurrentUsage", mock.Anything, mock.Anything).Return(map[string]metrics.CurrentUsage{}, nil)
	ms.On("GetStorageUsage", mock.Anything, mock.Anything).Return(map[string]metrics.StorageUsage{}, nil).Maybe()
	ms.On("GetNodeUsage", mock.Anything).Return([]metrics.NodeUsage{{Node: "n1"}}, nil)
	ms.On("GetResourceMetrics", mock.Anything, "det1").Return(metrics.ResourceMetrics{Range: "24h"}, nil)

	rec := &recorder{}
	rt.On("SendMessage", mock.Anything, mock.Anything).Run(rec.record).Return(nil)

	uc.Execute(WatchMetricsInput{ClientID: "c1", Action: ActionStart, Channel: "dashboard", UIDs: []string{"a"}, Nodes: true})
	uc.Execute(WatchMetricsInput{ClientID: "c2", Action: ActionStart, Channel: "detail", UID: "det1"})

	// Wait for both initial (async) serves to land before ticking.
	assert.Eventually(t, func() bool { return rec.countOf(realtime.METRICS_NODES) >= 1 }, time.Second, 5*time.Millisecond)

	uc.tick()

	assert.GreaterOrEqual(t, rec.countOf(realtime.METRICS_NODES), 2)    // initial + tick
	assert.GreaterOrEqual(t, rec.countOf(realtime.METRICS_RESOURCE), 2) // initial + tick
	assert.GreaterOrEqual(t, rec.countOf(realtime.METRICS_STATUS), 4)   // 2 subscribes + tick fan-out (2)
}

func TestOnCloseCleansUpClient(t *testing.T) {
	ms := mocks.NewMetricsService(t)
	rt := mocks.NewRealtimeService(t)
	ms.On("Status").Return(activeStatus()).Maybe()
	ms.On("GetCurrentUsage", mock.Anything, mock.Anything).Return(map[string]metrics.CurrentUsage{}, nil).Maybe()
	ms.On("GetStorageUsage", mock.Anything, mock.Anything).Return(map[string]metrics.StorageUsage{}, nil).Maybe()
	rt.On("SendMessage", mock.Anything, mock.Anything).Return(nil).Maybe()

	var listener realtime.Listener
	rt.On("AddConnectionListener", mock.Anything).Run(func(args mock.Arguments) {
		listener = args.Get(0).(realtime.Listener)
	})
	// OnClose must deregister the namespaced listener so the manager's map does
	// not leak an entry per connection.
	rt.On("RemoveConnectionListener", "metrics-c1").Return()

	uc := newWatchMetricsUseCase(ms, rt)
	uc.Execute(WatchMetricsInput{ClientID: "c1", Action: ActionStart, Channel: "tree", UIDs: []string{"u"}})
	assert.NotEmpty(t, uc.snapshot())

	// OnClose is invoked with the bare client ID even though the listener is
	// registered under a namespaced key.
	listener.OnClose("c1")
	assert.Empty(t, uc.snapshot())
	rt.AssertCalled(t, "RemoveConnectionListener", "metrics-c1")
}

func contains(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}
