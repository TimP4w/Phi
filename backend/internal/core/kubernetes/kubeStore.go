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
	// GetResources returns a snapshot of the resources map as pointers.
	GetResources() map[string]*Resource
	// FindChildrenResourcesByRef retrieves all child resources for a given reference.
	// Reference is a string that uniquely identifies a resource, in the format
	// `group/version/Kind:namespace/name` (group "core" for the core API group).
	//
	// Example:
	//
	//	// Find all children of the Pod named "nginx" in "default" namespace:
	//	children := store.FindChildrenResourcesByRef("core/v1/Pod:default/nginx")
	FindChildrenResourcesByRef(ref string) []Resource

	// AddEvent records an event for the resource with the given UID. It returns false
	// if the resource is unknown, the event is older than ttl, or it is a stale
	// duplicate; recurring events (same UID, newer observation/count) replace the
	// stored copy and return true.
	AddEvent(resourceUID string, ev Event, ttl time.Duration, max int) bool
	// GetEventsByResourceUID returns the recorded events for the resource with the given UID.
	GetEventsByResourceUID(resourceUID string) []Event
	// SetSuspended mutates the IsSuspended flag on a resource under the store lock.
	// Returns false if the resource does not exist.
	SetSuspended(uid string, suspended bool) bool
}
