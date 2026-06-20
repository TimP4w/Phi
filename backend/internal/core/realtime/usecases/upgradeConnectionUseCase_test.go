package realtimeusecases

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

// newUseCase builds the use case via its real constructor and returns both it and
// the on-connect listener it registers, so tests drive the resource-sync
// behaviour without a real WebSocket.
func newUseCase(t *testing.T, store kube.KubeStore) (*mocks.RealtimeService, shared.UseCase[UpgradeConnectionInput, bool], realtime.Listener) {
	rt := mocks.NewRealtimeService(t)
	var captured realtime.Listener
	rt.On("AddConnectionListener", mock.Anything).Run(func(args mock.Arguments) {
		captured = args.Get(0).(realtime.Listener)
	}).Return()

	uc := NewUpgradeConnectionUseCase(UpgradeConnectionUseCaseParams{
		RealtimeService: rt,
		KubeStore:       store,
	})
	require.NotNil(t, captured.OnConnect, "use case must register an OnConnect listener")
	return rt, uc, captured
}

func TestExecute_UpgradeSuccess(t *testing.T) {
	rt, uc, _ := newUseCase(t, kube.NewKubeStoreImpl())
	rt.On("Upgrade", mock.Anything, mock.Anything).Return("client-1", nil)

	ok, err := uc.Execute(UpgradeConnectionInput{
		W: httptest.NewRecorder(),
		R: httptest.NewRequest(http.MethodGet, "/ws", nil),
	})

	assert.NoError(t, err)
	assert.True(t, ok)
}

func TestExecute_UpgradeFailure(t *testing.T) {
	rt, uc, _ := newUseCase(t, kube.NewKubeStoreImpl())
	rt.On("Upgrade", mock.Anything, mock.Anything).Return("", errors.New("handshake failed"))

	ok, err := uc.Execute(UpgradeConnectionInput{
		W: httptest.NewRecorder(),
		R: httptest.NewRequest(http.MethodGet, "/ws", nil),
	})

	assert.Error(t, err)
	assert.False(t, ok)
}

// On connect, the use case must push the full current store contents to the newly
// connected client as a single RESOURCE_SYNC message addressed to that client.
func TestOnConnect_SendsFullResourceSnapshot(t *testing.T) {
	store := kube.NewKubeStoreImpl()
	store.UpdateResource(kube.Resource{UID: "a", Kind: "Pod", Name: "p1"})
	store.UpdateResource(kube.Resource{UID: "b", Kind: "Pod", Name: "p2"})

	rt, _, listener := newUseCase(t, store)

	var sent realtime.Message
	rt.On("SendMessage", mock.Anything, "client-1").Run(func(args mock.Arguments) {
		sent = args.Get(0).(realtime.Message)
	}).Return(nil)

	listener.OnConnect("client-1")

	assert.Equal(t, realtime.RESOURCE_SYNC, sent.Type)
	assert.Equal(t, "client-1", sent.ClientId)
	resources, ok := sent.Message.([]kube.Resource)
	require.True(t, ok, "RESOURCE_SYNC payload must be a []Resource")
	assert.Len(t, resources, 2)
}

// A send failure must be tolerated (logged, not panicked) so one bad client does
// not take down the connect path.
func TestOnConnect_SendFailureIsTolerated(t *testing.T) {
	store := kube.NewKubeStoreImpl()
	store.UpdateResource(kube.Resource{UID: "a", Kind: "Pod", Name: "p1"})

	rt, _, listener := newUseCase(t, store)
	rt.On("SendMessage", mock.Anything, "client-1").Return(errors.New("client gone"))

	assert.NotPanics(t, func() { listener.OnConnect("client-1") })
}
