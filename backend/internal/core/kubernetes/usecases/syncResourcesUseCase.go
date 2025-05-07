package kubernetesusecases

import (
	"log"

	"github.com/timp4w/phi/internal/core/kubernetes"
	shared "github.com/timp4w/phi/internal/core/shared"
	"github.com/timp4w/phi/internal/core/tree"
)

type SyncResourcesUseCase struct {
	kubeService kubernetes.KubeService
	treeService tree.TreeService
	kubeStore   kubernetes.KubeStore
}

func NewSyncResourcesUseCase() shared.UseCase[struct{}, map[string]*kubernetes.Resource] {
	return &SyncResourcesUseCase{
		treeService: shared.GetTreeService(),
		kubeService: shared.GetKubeService(),
		kubeStore:   shared.GetKubeStore(),
	}
}

func (uc *SyncResourcesUseCase) Execute(in struct{}) (map[string]*kubernetes.Resource, error) {
	// TODO: reset informers, reset watchers, etc.
	rm, err := uc.kubeService.FindAllApis()
	if err != nil {
		log.Fatalf("Error finding APIs: %v", err)
		return nil, err
	}
	resources, err := uc.kubeService.FindAllResources(rm)
	/*if err != nil {
		 log.Fatalf("Error getting resources: %v", err) // TODO: This is not fatal!
		 return nil, err
	}*/

	uc.kubeStore.SetResources(resources)
	var root kubernetes.Resource
	for _, resource := range resources {
		uc.kubeStore.RegisterResource(resource)
		if resource.Kind == "Kustomization" && resource.Name == "flux-system" {
			root = *resource
		}
	}

	visited := make(map[string]bool)
	visited[root.GetRef()] = true
	uc.findChildrenRec(&root, visited)
	uc.treeService.SetTree(root)
	return resources, nil
}

func (uc *SyncResourcesUseCase) findChildrenRec(root *kubernetes.Resource, visited map[string]bool) *kubernetes.Resource {
	children := uc.kubeStore.FindChildrenResourcesByRef(root.GetRef())
	for _, child := range children {
		if !visited[child.GetRef()] {
			visited[child.GetRef()] = true
			root.Children = append(root.Children, *uc.findChildrenRec(&child, visited))
		}
	}
	return root
}
