package kubernetes

type KubeStore interface {
	GetResourceByUID(uid string) *Resource
	UpdateResource(newResource Resource) *Resource
	RemoveResource(uid string)
	SetResources(resources map[string]*Resource) map[string]*Resource
	GetResources() map[string]Resource
	FindChildrenResourcesByRef(ref string) []Resource
	RegisterResource(resource *Resource)
}
