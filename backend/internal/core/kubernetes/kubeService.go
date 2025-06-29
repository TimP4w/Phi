package kubernetes

import (
	"context"
)

type PatchableResource interface {
	ResourceMeta() Resource
	PatchJSON() ([]byte, error)
	PatchType() string // TODO: use custom type for this
}

type KubeService interface {
	// GetResourceYAML retrieves the YAML representation of a Kubernetes resource. (Describes the resource in YAML format)
	GetResourceYAML(resource Resource) ([]byte, error)
	// WatchLogs starts watching logs for a specific pod and calls the provided onLog function for each log line received.
	WatchLogs(pod Resource, ctx context.Context, onLog func(KubeLog)) error
	// WatchResources starts watching Kubernetes resources
	WatchResources(kinds map[string]struct{}, addFunc func(Resource), updateFunc func(oldEl, newEl Resource), deleteFunc func(Resource))
	// WatchEvents starts watching Kubernetes events and calls the provided onEvent function for each event received.
	WatchEvents(onEvent func(*Event))
	// DiscoverApis discovers all API resources available in the connected Kubernetes cluster.
	DiscoverApis() (*ResourceMap, error)
	// Concurrently queries all Kubernetes API resources specified in the given ResourceMap and constructs a map keyed by their UID.
	// If any error occurs during resource discovery, the first encountered error is returned alongside the results.
	DiscoverResources(rm *ResourceMap) (map[string]*Resource, error)
	// GetEvents retrieves all Kubernetes events from the cluster
	GetEvents() ([]Event, error)
	// GetInformerChannels returns the map of informer channels.
	GetInformerChannels() map[string]chan struct{}
	// PatchResource applies a patch to a Kubernetes resource and returns the updated resource.
	PatchResource(pr PatchableResource) (*Resource, error)
}
