package websocket

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/realtime"
)

type WebSocketManagerImpl struct {
	clients             map[string]*websocket.Conn
	lock                sync.RWMutex
	upgrader            websocket.Upgrader
	connectionListeners map[string]*realtime.Listener
	listener            map[string][]*realtime.MessageListener
	logger              logging.PhiLogger
}

func NewWebSocketManager() realtime.RealtimeService {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	logging.Logger().Info("Initializing WebSocket manager")
	return &WebSocketManagerImpl{
		clients:             make(map[string]*websocket.Conn),
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

		message := realtime.Message{}
		err = json.Unmarshal(p, &message)
		if err != nil {
			logging.Logger().WithClient(clientId).WithError(err).Error("Failed to unmarshal message")
			return "", err
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

	uuid := uuid.New()
	clientId := uuid.String()
	wm.clients[clientId] = conn
	logging.Logger().WithClient(clientId).Debug("Added new WebSocket client")
	return clientId
}

func (wm *WebSocketManagerImpl) RemoveClientById(id string) {
	wm.lock.Lock()
	defer wm.lock.Unlock()
	if _, exists := wm.clients[id]; exists {
		conn := wm.clients[id]
		delete(wm.clients, id)
		for listenerID := range wm.connectionListeners {
			wm.connectionListeners[listenerID].OnClose(id)
		}
		conn.Close()
		logging.Logger().WithClient(id).Debug("Removed WebSocket client")
	}
}

func (wm *WebSocketManagerImpl) AddConnectionListener(listener realtime.Listener) {
	wm.connectionListeners[listener.ID] = &listener
}

func (wm *WebSocketManagerImpl) RemoveConnectionListener(ID string) {
	delete(wm.connectionListeners, ID)
}

func (wm *WebSocketManagerImpl) Broadcast(message realtime.Message) error {
	wm.lock.Lock()
	defer wm.lock.Unlock()

	msg, err := json.Marshal(message)
	if err != nil {
		wm.logger.WithError(err).Error("Failed to marshal broadcast message")
		return err
	}

	clientCount := len(wm.clients)
	wm.logger.WithFields(map[string]any{
		"message_type": message.Type,
		"client_count": clientCount,
	}).Debug("Broadcasting message to clients")

	for id := range wm.clients {
		err := wm.clients[id].WriteMessage(websocket.TextMessage, msg)
		if err != nil {
			wm.logger.WithFields(map[string]any{
				string(logging.ClientID): id,
				"error":                  err.Error(),
			}).Debug("Error broadcasting to client, removing")
			wm.RemoveClientById(id)
		}
	}
	return nil
}

// SendMessage sends a message to a specific client by ID.
// It marshals the message to JSON and writes it to the WebSocket connection.
// If sending the message fails, it removes the client from the manager.
// Returns an error if the client is not found or if there is an error during sending.
func (wm *WebSocketManagerImpl) SendMessage(message realtime.Message, clientId string) error {
	logger := wm.logger.WithClient(clientId)

	wm.lock.Lock()
	defer wm.lock.Unlock()

	msg, err := json.Marshal(message)
	if err != nil {
		logger.WithError(err).Error("Failed to marshal message")
		return err
	}

	if _, exists := wm.clients[clientId]; exists {
		conn := wm.clients[clientId]
		err := conn.WriteMessage(websocket.TextMessage, msg)

		if err != nil {
			logger.WithError(err).Debug("Failed to send message to client, removing client")
			wm.RemoveClientById(clientId)
			return err
		}

		logger.WithField("message_type", message.Type).Debug("Message sent to client")
		return nil
	} else {
		logger.Debug("Client not found")
		return fmt.Errorf("client with id %s not found", clientId)
	}
}
