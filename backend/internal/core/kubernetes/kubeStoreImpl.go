package kubernetes

import (
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
	resources         map[string]*Resource
	resourcesRefs     map[string][]*Resource
	mu                sync.RWMutex
	informersChannels map[string]chan struct{}
}

var _ KubeStore = (*KubeStoreImpl)(nil)

func NewKubeStoreImpl() KubeStore {
	logger := logging.Logger()
	logger.Debug("Creating new KubeStoreImpl")

	service := &KubeStoreImpl{
		resources:         make(map[string]*Resource),
		resourcesRefs:     make(map[string][]*Resource),
		informersChannels: make(map[string]chan struct{}),
	}

	return service
}

func (k *KubeStoreImpl) RegisterResource(resource *Resource) {
	k.mu.Lock()
	defer k.mu.Unlock()

	logger := logging.Logger().WithResource(resource.Kind, resource.Name, resource.Namespace, resource.UID)

	ref := resource.GetRef()
	if _, exists := k.resourcesRefs[ref]; !exists {
		k.resourcesRefs[ref] = make([]*Resource, 0)
		logger.WithField("ref", ref).Debug("Created new resourceRefs entry")
	}

	k.registerParentRefs(resource)
}

// registerParentRefs handles registering the resource under its parent/owner references.
func (k *KubeStoreImpl) registerParentRefs(resource *Resource) {

	if len(resource.ParentRefs) > 0 {
		for _, ownerRef := range resource.ParentRefs {
			k.addResourceToRef(ownerRef, resource)
			resource.IsFluxManaged = false
		}
	} else if resource.Labels[KustomizationNameLabel] != "" {
		parentRef := k.generateRef(resource.Labels[KustomizationNameLabel], resource.Labels[KustomizationNamespaceLabel], "Kustomization", defaultKustomizationVersion, fluxKustomizeGroup)
		k.addResourceToRef(parentRef, resource)
		resource.IsFluxManaged = true
	} else if resource.Labels[HelmNameLabel] != "" {
		parentRef := k.generateRef(resource.Labels[HelmNameLabel], resource.Labels[HelmNamespaceLabel], "HelmRelease", defaultHelmReleaseVersion, fluxHelmGroup)
		k.addResourceToRef(parentRef, resource)
		resource.IsFluxManaged = true
	}
}

// addResourceToRef adds the resource to the resourcesRefs map for the given ref.
func (k *KubeStoreImpl) addResourceToRef(ref string, resource *Resource) {
	logger := logging.Logger().WithResource(resource.Kind, resource.Name, resource.Namespace, resource.UID)
	if _, exists := k.resourcesRefs[ref]; !exists {
		k.resourcesRefs[ref] = make([]*Resource, 0)
		logger.WithField("ref", ref).Debug("Created new reference entry")
	}

	var parentUIDs []string
	for _, parentRes := range k.resources {
		if parentRes.GetRef() == ref {
			parentUIDs = append(parentUIDs, parentRes.UID)
		}
	}
	if len(parentUIDs) > 0 {
		resource.ParentIDs = parentUIDs
	} else {
		resource.ParentIDs = nil
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
	refResources, exists := k.resourcesRefs[ref]
	if !exists {
		return
	}

	if k.isOnlyOwnerOfRef(res, ref) {
		delete(k.resourcesRefs, ref)
		logger.WithField("ref", ref).Debug("Removed owned resourcesRefs entry")
	} else {
		k.filterChildrenFromRef(res, ref, refResources)
		logger.WithField("ref", ref).Debug("Filtered children from resourcesRefs entry")
	}
}

// isOnlyOwnerOfRef checks if this resource is the only one with the given ref
func (k *KubeStoreImpl) isOnlyOwnerOfRef(res *Resource, ref string) bool {
	for otherUID, otherResource := range k.resources {
		if otherUID != res.UID && otherResource.GetRef() == ref {
			return false
		}
	}
	return true
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
	if len(res.ParentRefs) > 0 {
		for _, parentRef := range res.ParentRefs {
			k.removeResourceFromRef(parentRef, uid)
		}
	} else if res.Labels[KustomizationNameLabel] != "" {
		parentRef := k.generateRef(res.Labels[KustomizationNameLabel], res.Labels[KustomizationNamespaceLabel], "Kustomization", defaultKustomizationVersion, fluxKustomizeGroup)
		k.removeResourceFromRef(parentRef, uid)
	} else if res.Labels[HelmNameLabel] != "" {
		parentRef := k.generateRef(res.Labels[HelmNameLabel], res.Labels[HelmNamespaceLabel], "HelmRelease", defaultHelmReleaseVersion, fluxHelmGroup)
		k.removeResourceFromRef(parentRef, uid)
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
// The format is `name_namespace_kind_version`.
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

func (k *KubeStoreImpl) SetResources(resources map[string]*Resource) map[string]*Resource {
	k.mu.RLock()
	defer k.mu.RUnlock()
	logging.Logger().WithField("resource_count", len(resources)).Debug("Setting resources map")
	k.resources = resources
	return resources
}

func (k *KubeStoreImpl) GetResources() map[string]Resource {
	k.mu.RLock()
	defer k.mu.RUnlock()
	result := make(map[string]Resource)
	for key, value := range k.resources {
		result[key] = *value
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
		k.registerParentRefs(&newResource)
		return &newResource
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
		if children, ok := k.resourcesRefs[oldSelfRef]; ok {
			k.resourcesRefs[newSelfRef] = children
			delete(k.resourcesRefs, oldSelfRef)
		} else if _, ok := k.resourcesRefs[newSelfRef]; !ok {
			k.resourcesRefs[newSelfRef] = []*Resource{}
		}
	}

	k.registerParentRefs(updated)
	return updated
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

	res := k.resources[resourceUID]
	if res == nil {
		logger.Debug("Resource not found for event")
		return false
	}

	if time.Since(event.LastObserved) > ttl {
		logger.Debug("Event is older than TTL, not adding")
		return false
	}

	for _, ex := range res.Events {
		if ex.Name == event.Name && ex.LastObserved.Equal(event.LastObserved) {
			logger.Debug("Duplicate event found, not adding")
			return false
		}
	}

	cutoff := time.Now().Add(-ttl)
	eventList := res.Events[:0]
	for _, e := range res.Events {
		if e.LastObserved.After(cutoff) {
			logger.Debug("Event is within TTL, adding to active events")
			eventList = append(eventList, e)
		}
	}
	res.Events = eventList

	if len(res.Events) >= max {
		logger.Debug("Max events reached, removing oldest event")
		oldestIdx := 0
		oldest := res.Events[0].LastObserved
		for i := range res.Events {
			if res.Events[i].LastObserved.Before(oldest) {
				oldestIdx = i
				oldest = res.Events[i].LastObserved
			}
		}
		res.Events = append(res.Events[:oldestIdx], res.Events[oldestIdx+1:]...)
	}

	res.Events = append(res.Events, event)
	return true
}
