package kubernetes

import (
	"sync"

	"github.com/timp4w/phi/internal/core/logging"
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
		parentRef := k.generateRef(resource.Labels[KustomizationNameLabel], resource.Labels[KustomizationNamespaceLabel], "Kustomization", "v1")
		k.addResourceToRef(parentRef, resource)
		resource.IsFluxManaged = true
	} else if resource.Labels[HelmNameLabel] != "" {
		parentRef := k.generateRef(resource.Labels[HelmNameLabel], resource.Labels[HelmNamespaceLabel], "HelmRelease", "v2")
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

	delete(k.resourcesRefs, res.GetRef())
	delete(k.resources, uid)
	logger.Debug("Removed resource and its reference")

	k.removeFromParentRefs(res, uid)
}

// removeFromParentRefs removes the resource from all parent references.
func (k *KubeStoreImpl) removeFromParentRefs(res *Resource, uid string) {
	if len(res.ParentRefs) > 0 {
		for _, parentRef := range res.ParentRefs {
			k.removeResourceFromRef(parentRef, uid)
		}
	} else if res.Labels[KustomizationNameLabel] != "" {
		parentRef := res.Labels[KustomizationNameLabel] + "_" + res.Labels[KustomizationNamespaceLabel] + "_" + "Kustomization" + "_" + "v1" // TODO: do we want to hardcode the version?
		k.removeResourceFromRef(parentRef, uid)
	} else if res.Labels[HelmNameLabel] != "" {
		parentRef := res.Labels[HelmNameLabel] + "_" + res.Labels[HelmNamespaceLabel] + "_" + "HelmRelease" + "_" + "v2" // TODO: do we want to hardcode the version?
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
func (k *KubeStoreImpl) generateRef(name, namespace, kind, version string) string {
	return name + "_" + namespace + "_" + kind + "_" + version
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
	if _, exists := k.resources[newResource.UID]; !exists {
		k.resources[newResource.UID] = &newResource
		k.mu.Unlock()
		logger.Debug("Resource not found, registering new resource")
		k.RegisterResource(&newResource)
		k.mu.Lock()
	} else {
		k.resources[newResource.UID].Copy(newResource)
		logger.Debug("Resource found, updated existing resource")
	}
	return k.resources[newResource.UID]
}
