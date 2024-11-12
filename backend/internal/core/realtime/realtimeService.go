package realtime

import "net/http"

type RealtimeService interface {
	Upgrade(w http.ResponseWriter, r *http.Request) (string, error)
	Broadcast(message Message) error
	SendMessage(message Message, clientId string) error
	RemoveClientById(clientId string)
	AddConnectionListener(listener Listener)
	RemoveConnectionListener(ID string)
	RegisterListener(listener MessageListener)
}
