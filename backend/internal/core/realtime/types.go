package realtime

type Message struct {
	Message  interface{} `json:"message"`
	ClientId string      `json:"clientId"`
	Type     string      `json:"type"`
}

type Listener struct {
	ID      string
	OnClose func(clientId string)
}

type MessageListener struct {
	Type      string
	OnMessage func(message Message)
}
