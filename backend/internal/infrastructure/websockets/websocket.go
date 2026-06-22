package websocket

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/realtime"
	"github.com/timp4w/phi/internal/core/shared"
)

const (
	readTimeout      = 90 * time.Second
	writeTimeout     = 10 * time.Second
	writeChannelSize = 64
	// cap message size to prevent DoS
	maxMessageSize = 1 << 20 // 1 MiB
)

type WebSocketManagerImpl struct {
	clients             map[string]*websocket.Conn
	clientWriteChans    map[string]chan []byte
	lock                sync.RWMutex
	upgrader            websocket.Upgrader
	connectionListeners map[string]*realtime.Listener
	listener            map[string][]*realtime.MessageListener
	logger              logging.PhiLogger
}

func allowedOrigin(r *http.Request) bool {
	if os.Getenv(shared.ENV_PHI_DEV) == "true" {
		return true
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	origin = strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
	return origin == r.Host
}

func NewWebSocketManager() realtime.RealtimeService {
	upgrader := websocket.Upgrader{
		CheckOrigin: allowedOrigin,
	}

	logging.Logger().Info("Initializing WebSocket manager")
	return &WebSocketManagerImpl{
		clients:             make(map[string]*websocket.Conn),
		clientWriteChans:    make(map[string]chan []byte),
		upgrader:            upgrader,
		connectionListeners: make(map[string]*realtime.Listener),
		listener:            make(map[string][]*realtime.MessageListener),
		logger:              *logging.Logger(),
	}
}

var _ realtime.RealtimeService = (*WebSocketManagerImpl)(nil)

func (wm *WebSocketManagerImpl) RegisterListener(listener realtime.MessageListener) {
	if _, exists := wm.listener[listener.Type]; !exists {
		wm.listener[listener.Type] = make([]*realtime.MessageListener, 0)
	}
	wm.listener[listener.Type] = append(wm.listener[listener.Type], &listener)
}

func (wm *WebSocketManagerImpl) Upgrade(w http.ResponseWriter, r *http.Request) (string, error) {
	conn, err := wm.upgrader.Upgrade(w, r, nil)
	if err != nil {
		wm.logger.WithError(err).Error("Failed to upgrade connection to WebSocket")
		return "", err
	}

	clientId := wm.addClient(conn)
	defer wm.RemoveClientById(clientId)

	wm.logger.WithClient(clientId).Info("Client connected")
	wm.SendMessage(realtime.Message{Type: realtime.CONNECTED, Message: clientId, ClientId: clientId}, clientId)

	// Notify on-connect listeners (e.g. to send initial RESOURCE_SYNC)
	wm.lock.RLock()
	var onConnectCallbacks []func(string)
	for _, listener := range wm.connectionListeners {
		if listener.OnConnect != nil {
			onConnectCallbacks = append(onConnectCallbacks, listener.OnConnect)
		}
	}
	wm.lock.RUnlock()
	for _, fn := range onConnectCallbacks {
		fn(clientId)
	}

	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(readTimeout))
	for {
		_, p, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseGoingAway) {
				logging.Logger().WithClient(clientId).Info("Client disconnected")
				return "", nil
			}
			logging.Logger().WithClient(clientId).WithError(err).Error("Error reading message")
			return "", err
		}
		conn.SetReadDeadline(time.Now().Add(readTimeout))

		message := realtime.Message{}
		err = json.Unmarshal(p, &message)
		if err != nil {
			// A malformed frame shouldn't tear down the connection; skip it.
			logging.Logger().WithClient(clientId).WithError(err).Warn("Failed to unmarshal message, skipping")
			continue
		}
		message.ClientId = clientId

		switch message.Type {
		case realtime.PING:
			wm.SendMessage(realtime.Message{Type: realtime.PONG, Message: realtime.PONG, ClientId: message.ClientId}, clientId)
		default:
			if listeners, exists := wm.listener[message.Type]; exists {
				for _, listener := range listeners {
					listener.OnMessage(message)
				}
			}
		}
	}
}

func (wm *WebSocketManagerImpl) addClient(conn *websocket.Conn) string {
	wm.lock.Lock()
	defer wm.lock.Unlock()

	clientId := uuid.New().String()
	ch := make(chan []byte, writeChannelSize)
	wm.clients[clientId] = conn
	wm.clientWriteChans[clientId] = ch
	go wm.runWriter(clientId, conn, ch)
	logging.Logger().WithClient(clientId).Debug("Added new WebSocket client")
	return clientId
}

// runWriter drains the per-client write channel and sends each message with a write deadline.
// It exits when the channel is closed or a write fails.
func (wm *WebSocketManagerImpl) runWriter(clientId string, conn *websocket.Conn, ch <-chan []byte) {
	for msg := range ch {
		conn.SetWriteDeadline(time.Now().Add(writeTimeout))
		if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			wm.logger.WithClient(clientId).WithError(err).Debug("Write error, removing client")
			wm.RemoveClientById(clientId)
			return
		}
	}
}

// removeClientLocked removes a client and returns its OnClose callbacks to be
// called by the caller after the lock is released.
func (wm *WebSocketManagerImpl) removeClientLocked(id string) []func() {
	conn, exists := wm.clients[id]
	if !exists {
		return nil
	}
	delete(wm.clients, id)
	if ch, ok := wm.clientWriteChans[id]; ok {
		close(ch)
		delete(wm.clientWriteChans, id)
	}
	conn.Close()
	logging.Logger().WithClient(id).Debug("Removed WebSocket client")

	var callbacks []func()
	for _, listener := range wm.connectionListeners {
		if listener.OnClose != nil {
			cb := listener.OnClose
			callbacks = append(callbacks, func() { cb(id) })
		}
	}
	return callbacks
}

func (wm *WebSocketManagerImpl) RemoveClientById(id string) {
	var callbacks []func()
	defer func() {
		for _, cb := range callbacks {
			cb()
		}
	}()
	wm.lock.Lock()
	defer wm.lock.Unlock()
	callbacks = wm.removeClientLocked(id)
}

func (wm *WebSocketManagerImpl) AddConnectionListener(listener realtime.Listener) {
	wm.lock.Lock()
	defer wm.lock.Unlock()
	wm.connectionListeners[listener.ID] = &listener
}

func (wm *WebSocketManagerImpl) RemoveConnectionListener(ID string) {
	wm.lock.Lock()
	defer wm.lock.Unlock()
	delete(wm.connectionListeners, ID)
}

func (wm *WebSocketManagerImpl) Broadcast(message realtime.Message) error {
	msg, err := json.Marshal(message)
	if err != nil {
		wm.logger.WithError(err).Error("Failed to marshal broadcast message")
		return err
	}

	wm.lock.RLock()
	wm.logger.WithFields(map[string]any{
		"message_type": message.Type,
		"client_count": len(wm.clientWriteChans),
	}).Debug("Broadcasting message to clients")
	var slowClients []string
	for id, ch := range wm.clientWriteChans {
		select {
		case ch <- msg:
		default:
			slowClients = append(slowClients, id)
		}
	}
	wm.lock.RUnlock()

	for _, id := range slowClients {
		wm.logger.WithField(string(logging.ClientID), id).Debug("Slow client, removing")
		wm.RemoveClientById(id)
	}
	return nil
}

// SendMessage sends a message to a specific client by ID.
// It marshals the message to JSON and enqueues it to the client's write channel.
// Returns an error if the client is not found or its buffer is full.
func (wm *WebSocketManagerImpl) SendMessage(message realtime.Message, clientId string) error {
	logger := wm.logger.WithClient(clientId)

	msg, err := json.Marshal(message)
	if err != nil {
		logger.WithError(err).Error("Failed to marshal message")
		return err
	}

	wm.lock.RLock()
	ch, exists := wm.clientWriteChans[clientId]
	wm.lock.RUnlock()

	if !exists {
		logger.Debug("Client not found")
		return fmt.Errorf("client with id %s not found", clientId)
	}

	select {
	case ch <- msg:
		logger.WithField("message_type", message.Type).Debug("Message enqueued for client")
		return nil
	default:
		logger.Debug("Client write buffer full, removing client")
		wm.RemoveClientById(clientId)
		return fmt.Errorf("client %s write buffer full", clientId)
	}
}
