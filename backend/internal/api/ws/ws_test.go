package controllers

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"

	kubernetesusecases "github.com/timp4w/phi/internal/core/kubernetes/usecases"
	metricsusecases "github.com/timp4w/phi/internal/core/metrics/usecases"
	"github.com/timp4w/phi/internal/core/realtime"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

// captureListeners records every MessageListener the controller registers, keyed
// by its Type, so a test can drive the OnMessage closures directly.
func captureListeners(rt *mocks.RealtimeService) map[string]func(realtime.Message) {
	byType := map[string]func(realtime.Message){}
	rt.On("RegisterListener", mock.Anything).Run(func(args mock.Arguments) {
		l := args.Get(0).(realtime.MessageListener)
		byType[l.Type] = l.OnMessage
	}).Return()
	return byType
}

func TestResourceWSController_HandleWatchLogs(t *testing.T) {
	uc := mocks.NewUseCase[kubernetesusecases.WatchLogsUseCaseInput, struct{}](t)
	rt := mocks.NewRealtimeService(t)
	listeners := captureListeners(rt)

	NewResourceWSController(uc, rt)

	handler, ok := listeners[realtime.START_WATCH_LOGS]
	assert.True(t, ok, "controller must register a START_WATCH_LOGS listener")

	uc.On("Execute", kubernetesusecases.WatchLogsUseCaseInput{
		ClientID:   "client-1",
		ResourceID: "pod-uid",
	}).Return(struct{}{}, nil)

	handler(realtime.Message{ClientId: "client-1", Message: "pod-uid"})

	uc.AssertExpectations(t)
}

func TestMetricsWSController_ValidStartSubscription(t *testing.T) {
	uc := mocks.NewUseCase[metricsusecases.WatchMetricsInput, struct{}](t)
	rt := mocks.NewRealtimeService(t)
	listeners := captureListeners(rt)

	NewMetricsWSController(uc, rt)

	start := listeners[realtime.START_WATCH_METRICS]
	assert.NotNil(t, start)

	uc.On("Execute", metricsusecases.WatchMetricsInput{
		Channel:  "cpu",
		ClientID: "client-1",
		Action:   metricsusecases.ActionStart,
	}).Return(struct{}{}, nil)

	// Payload arrives as the decoded map[string]any it would over the wire.
	start(realtime.Message{
		ClientId: "client-1",
		Message:  map[string]any{"channel": "cpu"},
	})

	uc.AssertExpectations(t)
}

func TestMetricsWSController_EmptyChannelIsDropped(t *testing.T) {
	uc := mocks.NewUseCase[metricsusecases.WatchMetricsInput, struct{}](t)
	rt := mocks.NewRealtimeService(t)
	listeners := captureListeners(rt)

	NewMetricsWSController(uc, rt)

	// No Execute expectation: an empty channel must not reach the use case, or it
	// would register a junk subscription the ticker serves until disconnect.
	listeners[realtime.START_WATCH_METRICS](realtime.Message{
		ClientId: "client-1",
		Message:  map[string]any{"channel": ""},
	})

	uc.AssertNotCalled(t, "Execute", mock.Anything)
}

func TestMetricsWSController_InvalidPayloadIsDropped(t *testing.T) {
	uc := mocks.NewUseCase[metricsusecases.WatchMetricsInput, struct{}](t)
	rt := mocks.NewRealtimeService(t)
	listeners := captureListeners(rt)

	NewMetricsWSController(uc, rt)

	// A non-object payload fails to unmarshal into the typed input and is dropped.
	listeners[realtime.START_WATCH_METRICS](realtime.Message{
		ClientId: "client-1",
		Message:  "not-an-object",
	})

	uc.AssertNotCalled(t, "Execute", mock.Anything)
}
