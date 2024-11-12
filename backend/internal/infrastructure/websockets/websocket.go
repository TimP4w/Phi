package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/timp4w/phi/internal/core/realtime"
)

type WebSocketManagerImpl struct {
	clients             map[string]*websocket.Conn
	lock                sync.RWMutex
	upgrader            websocket.Upgrader
	connectionListeners map[string]*realtime.Listener
	listener            map[string][]*realtime.MessageListener
}

func NewWebSocketManager() *WebSocketManagerImpl {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	return &WebSocketManagerImpl{
		clients:             make(map[string]*websocket.Conn),
		upgrader:            upgrader,
		connectionListeners: make(map[string]*realtime.Listener),
		listener:            make(map[string][]*realtime.MessageListener),
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
		return "", err
	}

	clientId := wm.addClient(conn)
	defer wm.RemoveClientById(clientId)

	wm.SendMessage(realtime.Message{Type: realtime.CONNECTED, Message: clientId, ClientId: clientId}, clientId)

	for {
		_, p, err := conn.ReadMessage()
		if err != nil {
			return "", err
		}
		message := realtime.Message{}
		err = json.Unmarshal(p, &message)
		if err != nil {
			log.Fatalf("Failed to unmarshal message: %v", err)
		}
		message.ClientId = clientId

		switch message.Type {
		case realtime.PING:
			wm.SendMessage(realtime.Message{Type: realtime.PONG, Message: "PONG", ClientId: message.ClientId}, clientId)
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
	wm.clients[uuid.String()] = conn
	return uuid.String()
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
		log.Fatalf("Failed to marshal message: %v", err)
		return err
	}
	for id := range wm.clients {
		err := wm.clients[id].WriteMessage(websocket.TextMessage, msg)
		if err != nil {
			wm.RemoveClientById(id)
		}
	}
	return nil
}

func (wm *WebSocketManagerImpl) SendMessage(message realtime.Message, clientId string) error {
	wm.lock.Lock()
	defer wm.lock.Unlock()
	msg, err := json.Marshal(message)
	if err != nil {
		log.Fatalf("Failed to marshal message: %v", err)
		return err
	}

	var error error
	if _, exists := wm.clients[clientId]; exists {
		conn := wm.clients[clientId]
		error = conn.WriteMessage(websocket.TextMessage, msg)
	} else {
		return fmt.Errorf("client with id %s not found", clientId)
	}

	if error != nil {
		wm.RemoveClientById(clientId)
		return error
	}
	return nil
}
