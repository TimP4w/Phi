package kubernetes

import (
	"context"
)

// PatchType is the wire encoding of a patch. It mirrors the string values of
// k8s.io/apimachinery's types.PatchType so the infra adapter can convert with a
// plain cast, while keeping the core layer free of an apimachinery dependency.
type PatchType string

const (
	JSONPatchType           PatchType = "application/json-patch+json"
	MergePatchType          PatchType = "application/merge-patch+json"
	StrategicMergePatchType PatchType = "application/strategic-merge-patch+json"
	ApplyPatchType          PatchType = "application/apply-patch+yaml"
)

type PatchableResource interface {
	ResourceMeta() Resource
	PatchJSON() ([]byte, error)
	PatchType() PatchType
}

type KubeService interface {
	// GetResourceYAML retrieves the YAML representation of a Kubernetes resource. (Describes the resource in YAML format)
	GetResourceYAML(resource Resource) ([]byte, error)
	// WatchLogs starts watching logs for a specific pod and calls the provided onLog function for each log line received.
	WatchLogs(pod Resource, ctx context.Context, onLog func(KubeLog)) error
	// WatchResources starts informers for the given API resources and blocks until their
	// caches complete the initial sync, during which every existing object is delivered
	// through addFunc. CustomResourceDefinitions added at runtime automatically get an
	// informer for the resource type they define.
	WatchResources(apis []ApiResource, addFunc func(Resource), updateFunc func(oldEl, newEl Resource), deleteFunc func(Resource))
	// WatchEvents starts watching Kubernetes events and calls the provided onEvent function for each event received.
	WatchEvents(onEvent func(*Event))
	// DiscoverApis returns all API resources available in the connected Kubernetes
	// cluster that support list and watch.
	DiscoverApis() ([]ApiResource, error)
	// GetEvents retrieves all Kubernetes events from the cluster
	GetEvents() ([]Event, error)
	// PatchResource applies a patch to a Kubernetes resource and returns the updated resource.
	PatchResource(pr PatchableResource) (*Resource, error)
}
