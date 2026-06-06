package kubernetes

import "time"

type KubeStore interface {
	// GetResourceByUID retrieves a resource from the resources map by its UID.
	// Returns nil if the resource does not exist.
	GetResourceByUID(uid string) *Resource
	// UpdateResource updates an existing resource or registers a new one if it does not exist.
	// It returns the updated or newly registered resource.
	UpdateResource(newResource Resource) *Resource
	// RemoveResource removes a resource from the store by its UID.
	// It also removes the resource from its parent's references if it exists.
	RemoveResource(uid string)
	// SetResources sets the resources map and returns it.
	SetResources(resources map[string]*Resource) map[string]*Resource
	// GetResources returns a snapshot of the resources map as pointers.
	GetResources() map[string]*Resource
	// FindChildrenResourcesByRef retrieves all child resources for a given reference.
	// Reference is a string that uniquely identifies a resource, in the format `name_namespace_kind_version`.
	//
	// Example:
	//
	//	// Find all children of the Pod named "nginx" in "default" namespace:
	//	children := store.FindChildrenResourcesByRef("nginx_default_Pod_v1")
	FindChildrenResourcesByRef(ref string) []Resource
	// RegisterResource registers a resource and its parent/owner references in the store.
	RegisterResource(resource *Resource)

	AddEvent(resourceUID string, ev Event, ttl time.Duration, max int) bool
	// GetKnownResourceAPIRefs returns the set of resource API ref keys (resource_version_group)
	// for all resources currently in the store. Used to determine which K8s resource types to watch.
	GetKnownResourceAPIRefs() map[string]struct{}
	// SetSuspended mutates the IsSuspended flag on a resource under the store lock.
	// Returns false if the resource does not exist.
	SetSuspended(uid string, suspended bool) bool
}
