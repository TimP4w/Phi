package kubernetes

import (
	"sync"
)

type KubeStoreImpl struct {
	resources         map[string]*Resource
	resourcesRefs     map[string][]*Resource
	mu                sync.RWMutex
	informersChannels map[string]chan struct{}
}

var _ KubeStore = (*KubeStoreImpl)(nil)

func NewKubeStoreImpl() KubeStore {

	service := &KubeStoreImpl{
		resources:         make(map[string]*Resource),
		resourcesRefs:     make(map[string][]*Resource),
		informersChannels: make(map[string]chan struct{}),
	}

	return service
}

func (k *KubeStoreImpl) RegisterResource(resource *Resource) {
	k.mu.RLock()
	defer k.mu.RUnlock()

	if _, exists := k.resourcesRefs[resource.GetRef()]; !exists {
		k.resourcesRefs[resource.GetRef()] = make([]*Resource, 0)
	}

	if len(resource.ParentRefs) > 0 {
		for _, ownerRef := range resource.ParentRefs {
			if _, exists := k.resourcesRefs[ownerRef]; !exists {
				k.resourcesRefs[ownerRef] = make([]*Resource, 0)
			}
			k.resourcesRefs[ownerRef] = append(k.resourcesRefs[ownerRef], resource)
			resource.IsFluxManaged = false
		}
	} else if resource.Labels[KustomizationNameLabel] != "" {
		parentRef := k.generateRef(resource.Labels[KustomizationNameLabel], resource.Labels[KustomizationNamespaceLabel], "Kustomization", "v1") // TODO: do we want to hardcode the version?

		if _, exists := k.resourcesRefs[parentRef]; !exists {
			k.resourcesRefs[parentRef] = make([]*Resource, 0)
		}
		k.resourcesRefs[parentRef] = append(k.resourcesRefs[parentRef], resource)
		resource.IsFluxManaged = true
	} else if resource.Labels[HelmNameLabel] != "" {
		parentRef := k.generateRef(resource.Labels[HelmNameLabel], resource.Labels[HelmNamespaceLabel], "HelmRelease", "v2") // TODO: do we want to hardcode the version?
		if _, exists := k.resourcesRefs[parentRef]; !exists {
			k.resourcesRefs[parentRef] = make([]*Resource, 0)
		}
		k.resourcesRefs[parentRef] = append(k.resourcesRefs[parentRef], resource)
		resource.IsFluxManaged = true
	}
}

func (k *KubeStoreImpl) RemoveResource(uid string) {
	k.mu.Lock()
	defer k.mu.Unlock()

	res, exists := k.resources[uid]
	if exists {
		delete(k.resourcesRefs, res.GetRef())
		delete(k.resources, uid)
	}

	if len(res.ParentRefs) > 0 {
		for _, ownerRef := range res.ParentRefs {
			if _, exists := k.resourcesRefs[ownerRef]; exists {
				for i, ptr := range k.resourcesRefs[ownerRef] {
					if ptr.UID == uid {
						k.resourcesRefs[ownerRef] = append(k.resourcesRefs[ownerRef][:i], k.resourcesRefs[ownerRef][i+1:]...)
						break
					}
				}
			}
		}
	} else if res.Labels["kustomize.toolkit.fluxcd.io/name"] != "" {
		parentRef := res.Labels["kustomize.toolkit.fluxcd.io/name"] + "_" + res.Labels["kustomize.toolkit.fluxcd.io/namespace"] + "_" + "Kustomization" + "_" + "v1"
		if _, exists := k.resourcesRefs[parentRef]; exists {
			for i, ptr := range k.resourcesRefs[parentRef] {
				if ptr.UID == uid {
					k.resourcesRefs[parentRef] = append(k.resourcesRefs[parentRef][:i], k.resourcesRefs[parentRef][i+1:]...)
					break
				}
			}
		}
	} else if res.Labels["helm.toolkit.fluxcd.io/name"] != "" {
		parentRef := res.Labels["helm.toolkit.fluxcd.io/name"] + "_" + res.Labels["helm.toolkit.fluxcd.io/namespace"] + "_" + "HelmRelease" + "_" + "v2"

		if _, exists := k.resourcesRefs[parentRef]; exists {
			for i, ptr := range k.resourcesRefs[parentRef] {
				if ptr.UID == uid {
					k.resourcesRefs[parentRef] = append(k.resourcesRefs[parentRef][:i], k.resourcesRefs[parentRef][i+1:]...)
					break
				}
			}

		}
	}
}

func (k *KubeStoreImpl) generateRef(name, namespace, kind, version string) string {
	return name + "_" + namespace + "_" + kind + "_" + version
}

func (k *KubeStoreImpl) FindChildrenResourcesByRef(ref string) []Resource {
	k.mu.RLock()
	defer k.mu.RUnlock()
	if resources, exists := k.resourcesRefs[ref]; !exists {
		return nil
	} else {
		var result []Resource
		for _, resource := range resources {
			result = append(result, *resource)
		}
		return result
	}
}

func (k *KubeStoreImpl) GetResourceByUID(uid string) *Resource {
	k.mu.RLock()
	defer k.mu.RUnlock()
	resource, exists := k.resources[uid]
	if !exists {
		return nil
	}
	return resource
}

func (k *KubeStoreImpl) SetResources(resources map[string]*Resource) map[string]*Resource {
	k.mu.RLock()
	defer k.mu.RUnlock()
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
	return result
}

func (k *KubeStoreImpl) UpdateResource(newResource Resource) *Resource {
	k.mu.Lock()
	defer k.mu.Unlock()
	if _, exists := k.resources[newResource.UID]; !exists {
		k.resources[newResource.UID] = &newResource
		k.mu.Unlock()
		k.RegisterResource(&newResource)
		k.mu.Lock()
	} else {
		k.resources[newResource.UID].Copy(newResource)
	}
	return k.resources[newResource.UID]
}
