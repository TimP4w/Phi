package kubernetes

import (
	"context"
)

type KubeService interface {
	GetResourceYAML(resource Resource) ([]byte, error)
	WatchLogs(pod Resource, ctx context.Context, onLog func(KubeLog)) error
	WatchResources(kinds map[string]struct{}, addFunc func(Resource), updateFunc func(oldEl, newEl Resource), deleteFunc func(Resource))
	WatchEvents(onEvent func(*Event))
	Reconcile(el Resource) (*Resource, error)
	Suspend(el Resource) (*Resource, error)
	Resume(el Resource) (*Resource, error)
	FindAllApis() (*ResourceMap, error)
	FindAllResources(rm *ResourceMap) (map[string]*Resource, error)
	GetEvents() ([]Event, error)
	GetInformerChannels() map[string]chan struct{}
}
