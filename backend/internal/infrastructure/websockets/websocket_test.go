package websocket

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	gorillaws "github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/timp4w/phi/internal/core/realtime"
)

func dialWS(t *testing.T, srv *httptest.Server) *gorillaws.Conn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/"
	conn, _, err := gorillaws.DefaultDialer.Dial(url, nil)
	require.NoError(t, err)
	t.Cleanup(func() { conn.Close() })
	return conn
}

func newTestServer(t *testing.T) (*WebSocketManagerImpl, *httptest.Server) {
	t.Helper()
	wm := NewWebSocketManager().(*WebSocketManagerImpl)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wm.Upgrade(w, r) //nolint:errcheck
	}))
	t.Cleanup(srv.Close)
	return wm, srv
}

func readMsg(t *testing.T, conn *gorillaws.Conn) realtime.Message {
	t.Helper()
	_, raw, err := conn.ReadMessage()
	require.NoError(t, err)
	var msg realtime.Message
	require.NoError(t, json.Unmarshal(raw, &msg))
	return msg
}

func TestWebSocket_Upgrade_SendsConnectedMessage(t *testing.T) {
	_, srv := newTestServer(t)
	conn := dialWS(t, srv)

	msg := readMsg(t, conn)
	assert.Equal(t, realtime.CONNECTED, msg.Type)
	assert.NotEmpty(t, msg.Message)
}

func TestWebSocket_Broadcast_NoClients(t *testing.T) {
	wm := NewWebSocketManager().(*WebSocketManagerImpl)
	err := wm.Broadcast(realtime.Message{Type: realtime.TREE, Message: "hello"})
	assert.NoError(t, err)
}

func TestWebSocket_SendMessage_ClientNotFound(t *testing.T) {
	wm := NewWebSocketManager().(*WebSocketManagerImpl)
	err := wm.SendMessage(realtime.Message{Type: realtime.TREE}, "nonexistent-id")
	assert.ErrorContains(t, err, "not found")
}

func TestWebSocket_AddConnectionListener_CalledOnDisconnect(t *testing.T) {
	wm, srv := newTestServer(t)
	conn := dialWS(t, srv)

	// Read the CONNECTED message to get clientId
	msg := readMsg(t, conn)
	clientId := msg.Message.(string)

	closed := make(chan string, 1)
	wm.AddConnectionListener(realtime.Listener{
		ID: "test-listener",
		OnClose: func(id string) {
			closed <- id
		},
	})

	conn.Close()

	select {
	case id := <-closed:
		assert.Equal(t, clientId, id)
	case <-time.After(time.Second):
		t.Fatal("OnClose was not called after client disconnect")
	}
}

func TestWebSocket_RemoveConnectionListener(t *testing.T) {
	wm := NewWebSocketManager().(*WebSocketManagerImpl)
	wm.AddConnectionListener(realtime.Listener{ID: "l1", OnClose: func(string) {}})
	assert.Len(t, wm.connectionListeners, 1)

	wm.RemoveConnectionListener("l1")
	assert.Len(t, wm.connectionListeners, 0)
}

func TestWebSocket_RegisterListener_InvokedOnMessage(t *testing.T) {
	wm, srv := newTestServer(t)
	conn := dialWS(t, srv)
	readMsg(t, conn) // drain CONNECTED

	received := make(chan realtime.Message, 1)
	wm.RegisterListener(realtime.MessageListener{
		Type: "CUSTOM",
		OnMessage: func(msg realtime.Message) {
			received <- msg
		},
	})

	payload, _ := json.Marshal(realtime.Message{Type: "CUSTOM", Message: "hello"})
	require.NoError(t, conn.WriteMessage(gorillaws.TextMessage, payload))

	select {
	case msg := <-received:
		assert.Equal(t, "CUSTOM", msg.Type)
	case <-time.After(time.Second):
		t.Fatal("listener was not invoked")
	}
}

func TestWebSocket_Ping_ReturnsPong(t *testing.T) {
	_, srv := newTestServer(t)
	conn := dialWS(t, srv)
	readMsg(t, conn) // drain CONNECTED

	payload, _ := json.Marshal(realtime.Message{Type: realtime.PING})
	require.NoError(t, conn.WriteMessage(gorillaws.TextMessage, payload))

	msg := readMsg(t, conn)
	assert.Equal(t, realtime.PONG, msg.Type)
}

func TestWebSocket_Broadcast_ReachesClient(t *testing.T) {
	wm, srv := newTestServer(t)
	conn := dialWS(t, srv)
	readMsg(t, conn) // drain CONNECTED

	time.Sleep(5 * time.Millisecond) // let addClient finish
	err := wm.Broadcast(realtime.Message{Type: realtime.TREE, Message: "payload"})
	require.NoError(t, err)

	msg := readMsg(t, conn)
	assert.Equal(t, realtime.TREE, msg.Type)
}
