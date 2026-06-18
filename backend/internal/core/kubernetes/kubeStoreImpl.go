package kubernetes

import (
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/timp4w/phi/internal/core/logging"
)

const (
	defaultKustomizationVersion = "v1"
	defaultHelmReleaseVersion   = "v2"
	fluxKustomizeGroup          = "kustomize.toolkit.fluxcd.io"
	fluxHelmGroup               = "helm.toolkit.fluxcd.io"
)

type KubeStoreImpl struct {
	resources     map[string]*Resource
	resourcesRefs map[string][]*Resource
	ownersByRef   map[string][]string
	events        map[string][]Event
	mu            sync.RWMutex
}

var _ KubeStore = (*KubeStoreImpl)(nil)

func NewKubeStoreImpl() KubeStore {
	logger := logging.Logger()
	logger.Debug("Creating new KubeStoreImpl")

	service := &KubeStoreImpl{
		resources:     make(map[string]*Resource),
		resourcesRefs: make(map[string][]*Resource),
		ownersByRef:   make(map[string][]string),
		events:        make(map[string][]Event),
	}

	return service
}

// addOwnerRef records that the resource owns its self-ref, so it can be found as
// a parent of resources registered under that ref.
func (k *KubeStoreImpl) addOwnerRef(res *Resource) {
	ref := res.GetRef()
	k.ownersByRef[ref] = appendUIDIfMissing(k.ownersByRef[ref], res.UID)
}

// removeOwnerRef drops a UID from the owner index for the given ref.
func (k *KubeStoreImpl) removeOwnerRef(ref, uid string) {
	owners, exists := k.ownersByRef[ref]
	if !exists {
		return
	}
	for i, ownerUID := range owners {
		if ownerUID == uid {
			owners = append(owners[:i], owners[i+1:]...)
			break
		}
	}
	if len(owners) == 0 {
		delete(k.ownersByRef, ref)
	} else {
		k.ownersByRef[ref] = owners
	}
}

// parentRefsForResource returns the parent ref strings for a resource, along with
// whether those refs are Flux-managed (vs. Kubernetes owner-reference-based).
func (k *KubeStoreImpl) parentRefsForResource(resource *Resource) (refs []string, fluxManaged bool) {
	if len(resource.ParentRefs) > 0 {
		return resource.ParentRefs, false
	}
	if resource.Labels[KustomizationNameLabel] != "" {
		ref := k.generateRef(resource.Labels[KustomizationNameLabel], resource.Labels[KustomizationNamespaceLabel], "Kustomization", defaultKustomizationVersion, fluxKustomizeGroup)
		return []string{ref}, true
	}
	if resource.Labels[HelmNameLabel] != "" {
		ref := k.generateRef(resource.Labels[HelmNameLabel], resource.Labels[HelmNamespaceLabel], "HelmRelease", defaultHelmReleaseVersion, fluxHelmGroup)
		return []string{ref}, true
	}
	return nil, false
}

// registerParentRefs registers the resource under its parent/owner references.
func (k *KubeStoreImpl) registerParentRefs(resource *Resource) {
	refs, fluxManaged := k.parentRefsForResource(resource)
	for _, ref := range refs {
		k.addResourceToRef(ref, resource)
	}
	if len(refs) > 0 {
		resource.IsFluxManaged = fluxManaged
	}
}

// addResourceToRef adds the resource to the resourcesRefs map for the given ref.
func (k *KubeStoreImpl) addResourceToRef(ref string, resource *Resource) {
	logger := logging.Logger().WithResource(resource.Kind, resource.Name, resource.Namespace, resource.UID)
	if _, exists := k.resourcesRefs[ref]; !exists {
		k.resourcesRefs[ref] = make([]*Resource, 0)
		logger.WithField("ref", ref).Debug("Created new reference entry")
	}

	// Merge any parents found in the store into ParentIDs without discarding the
	// owner-reference UIDs the mapper already extracted, or parents from other refs.
	for _, parentUID := range k.ownersByRef[ref] {
		resource.ParentIDs = appendUIDIfMissing(resource.ParentIDs, parentUID)
	}

	k.resourcesRefs[ref] = append(k.resourcesRefs[ref], resource)
	logger.WithField("ref", ref).Debug("Registered resource as child of reference")
}

func (k *KubeStoreImpl) RemoveResource(uid string) {
	k.mu.Lock()
	defer k.mu.Unlock()

	logger := logging.Logger().WithField("resource_uid", uid)

	res, exists := k.resources[uid]
	if !exists {
		logger.Warn("Attempted to remove resource that does not exist")
		return
	}

	// Remove the resource from the main resources map
	delete(k.resources, uid)
	delete(k.events, uid)
	logger.Debug("Removed resource from main store")

	// Remove this resource from any refs it owns (as a parent)
	k.removeOwnedResourceRefs(res)

	// Remove this resource from parent references
	k.removeFromParentRefs(res, uid)
}

// removeOwnedResourceRefs removes any resourcesRefs entries where this resource was the owner/parent
func (k *KubeStoreImpl) removeOwnedResourceRefs(res *Resource) {
	logger := logging.Logger().WithResource(res.Kind, res.Name, res.Namespace, res.UID)

	ref := res.GetRef()
	k.removeOwnerRef(ref, res.UID)

	refResources, exists := k.resourcesRefs[ref]
	if !exists {
		return
	}

	if k.isOnlyOwnerOfRef(ref) {
		delete(k.resourcesRefs, ref)
		logger.WithField("ref", ref).Debug("Removed owned resourcesRefs entry")
	} else {
		k.filterChildrenFromRef(res, ref, refResources)
		logger.WithField("ref", ref).Debug("Filtered children from resourcesRefs entry")
	}
}

// isOnlyOwnerOfRef reports whether no resource (other than one already dropped
// from the owner index) still owns the given ref.
func (k *KubeStoreImpl) isOnlyOwnerOfRef(ref string) bool {
	return len(k.ownersByRef[ref]) == 0
}

// filterChildrenFromRef removes this resource's children from the ref
func (k *KubeStoreImpl) filterChildrenFromRef(res *Resource, ref string, refResources []*Resource) {
	var filteredRefs []*Resource
	for _, childRes := range refResources {
		if childRes.UID != res.UID {
			filteredRefs = append(filteredRefs, childRes)
		}
	}
	k.resourcesRefs[ref] = filteredRefs
}

// removeFromParentRefs removes the resource from all parent references.
func (k *KubeStoreImpl) removeFromParentRefs(res *Resource, uid string) {
	refs, _ := k.parentRefsForResource(res)
	for _, ref := range refs {
		k.removeResourceFromRef(ref, uid)
	}
}

// RemoveResourceFromRef removes a resource from a specific parent reference.
func (k *KubeStoreImpl) removeResourceFromRef(ref, uid string) {
	logger := logging.Logger().WithField("resource_uid", uid)
	if resources, exists := k.resourcesRefs[ref]; exists {
		for i, ptr := range resources {
			if ptr.UID == uid {
				k.resourcesRefs[ref] = append(resources[:i], resources[i+1:]...)
				logger.WithField("ref", ref).Debug("Removed resource from parent reference")
				break
			}
		}
	}
}

// generateRef creates a unique reference string for a resource based on its name, namespace, kind, and version.
// The format is `group/version/Kind:namespace/name`.
func (k *KubeStoreImpl) generateRef(name, namespace, kind, version, group string) string {
	if group == "" {
		group = "core"
	}
	parts := strings.Split(version, "/")
	v := parts[len(parts)-1]
	return group + "/" + v + "/" + kind + ":" + namespace + "/" + name
}

func (k *KubeStoreImpl) FindChildrenResourcesByRef(ref string) []Resource {
	k.mu.RLock()
	defer k.mu.RUnlock()
	logger := logging.Logger().WithField("ref", ref)
	resources, exists := k.resourcesRefs[ref]
	if !exists {
		logger.Debug("No children found for ref")
		return nil
	}
	var result []Resource
	for _, resource := range resources {
		result = append(result, *resource)
	}
	logger.WithField("child_count", len(result)).Debug("Found children for ref")
	return result
}

func (k *KubeStoreImpl) GetResourceByUID(uid string) *Resource {
	k.mu.RLock()
	defer k.mu.RUnlock()
	resource, exists := k.resources[uid]
	if !exists {
		logging.Logger().WithField("resource_uid", uid).Debug("Resource not found by UID")
		return nil
	}
	return resource
}

func (k *KubeStoreImpl) GetResources() map[string]*Resource {
	k.mu.RLock()
	defer k.mu.RUnlock()
	result := make(map[string]*Resource, len(k.resources))
	for key, value := range k.resources {
		result[key] = value
	}
	logging.Logger().WithField("resource_count", len(result)).Debug("Returning resources map")
	return result
}

func (k *KubeStoreImpl) UpdateResource(newResource Resource) *Resource {
	k.mu.Lock()
	defer k.mu.Unlock()
	logger := logging.Logger().WithResource(newResource.Kind, newResource.Name, newResource.Namespace, newResource.UID)
	existing, exists := k.resources[newResource.UID]
	if !exists {
		logger.Debug("Resource not found, registering new resource")
		k.resources[newResource.UID] = &newResource
		selfRef := newResource.GetRef()
		if _, ok := k.resourcesRefs[selfRef]; !ok {
			k.resourcesRefs[selfRef] = []*Resource{}
		}
		k.addOwnerRef(&newResource)
		k.registerParentRefs(&newResource)
		k.backfillChildrenParentIDs(&newResource)
		snapshot := Resource{}
		snapshot.Copy(newResource)
		return &snapshot
	}

	logger.Debug("Resource found, updated existing resource")
	oldSelfRef := existing.GetRef()
	oldParentRefs := append([]string(nil), existing.ParentRefs...)
	existing.Copy(newResource)
	updated := existing
	newSelfRef := updated.GetRef()

	if len(oldParentRefs) > 0 {
		for _, parentRef := range oldParentRefs {
			k.removeResourceFromRef(parentRef, updated.UID)
		}
	} else {
		k.removeFromParentRefs(updated, updated.UID)
	}
	if oldSelfRef != newSelfRef {
		k.removeOwnerRef(oldSelfRef, updated.UID)
		k.addOwnerRef(updated)
		if children, ok := k.resourcesRefs[oldSelfRef]; ok {
			k.resourcesRefs[newSelfRef] = children
			delete(k.resourcesRefs, oldSelfRef)
		} else if _, ok := k.resourcesRefs[newSelfRef]; !ok {
			k.resourcesRefs[newSelfRef] = []*Resource{}
		}
	}

	k.registerParentRefs(updated)
	k.backfillChildrenParentIDs(updated)
	snapshot := Resource{}
	snapshot.Copy(*updated)
	return &snapshot
}

// backfillChildrenParentIDs adds this resource's UID to the ParentIDs of children
// already registered under its ref. Resources arrive from informers in arbitrary
// order, so a parent may show up after its children.
func (k *KubeStoreImpl) backfillChildrenParentIDs(parent *Resource) {
	for _, child := range k.resourcesRefs[parent.GetRef()] {
		child.ParentIDs = appendUIDIfMissing(child.ParentIDs, parent.UID)
	}
}

func appendUIDIfMissing(uids []string, uid string) []string {
	for _, existing := range uids {
		if existing == uid {
			return uids
		}
	}
	return append(uids, uid)
}

func (k *KubeStoreImpl) SetSuspended(uid string, suspended bool) bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	res, exists := k.resources[uid]
	if !exists {
		return false
	}
	res.FluxMetadata.IsSuspended = suspended
	return true
}

func (k *KubeStoreImpl) AddEvent(resourceUID string, event Event, ttl time.Duration, max int) bool {
	k.mu.Lock()
	defer k.mu.Unlock()

	logger := logging.Logger().WithFields(map[string]any{
		"event_name":      event.Name,
		"event_kind":      event.Kind,
		"event_namespace": event.Namespace,
		"resource_uid":    event.ResourceUID,
	})

	if _, exists := k.resources[resourceUID]; !exists {
		logger.Debug("Resource not found for event")
		return false
	}

	if time.Since(event.LastObserved) > ttl {
		logger.Debug("Event is older than TTL, not adding")
		return false
	}

	cutoff := time.Now().Add(-ttl)
	var valid []Event
	updated := false
	for _, e := range k.events[resourceUID] {
		if !e.LastObserved.After(cutoff) {
			continue
		}
		if e.UID == event.UID {
			// Recurring event (same UID, count++/newer lastTimestamp): replace the
			// stored copy; an older or identical observation is a stale duplicate.
			if !event.LastObserved.After(e.LastObserved) && event.Count <= e.Count {
				logger.Debug("Duplicate event found, not adding")
				return false
			}
			updated = true
			continue
		}
		valid = append(valid, e)
	}

	valid = append(valid, event)
	if updated {
		logger.Debug("Updated recurring event")
	}

	if len(valid) > max {
		sort.Slice(valid, func(i, j int) bool {
			return valid[i].LastObserved.After(valid[j].LastObserved)
		})
		valid = valid[:max]
	}

	k.events[resourceUID] = valid
	return true
}

func (k *KubeStoreImpl) GetEventsByResourceUID(resourceUID string) []Event {
	k.mu.RLock()
	defer k.mu.RUnlock()
	return append([]Event(nil), k.events[resourceUID]...)
}
