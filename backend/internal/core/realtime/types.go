package realtime

import kube "github.com/timp4w/phi/internal/core/kubernetes"

type Message struct {
	Message  interface{} `json:"message"`
	ClientId string      `json:"clientId"`
	Type     string      `json:"type"`
}

type Listener struct {
	ID        string
	OnClose   func(clientId string)
	OnConnect func(clientId string)
}

type MessageListener struct {
	Type      string
	OnMessage func(message Message)
}

type ResourcePatch struct {
	Op       string        `json:"op"`
	Resource *kube.Resource `json:"resource,omitempty"`
}
