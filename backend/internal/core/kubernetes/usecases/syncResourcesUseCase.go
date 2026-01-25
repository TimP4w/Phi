package kubernetesusecases

import (
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	shared "github.com/timp4w/phi/internal/core/shared"
	"github.com/timp4w/phi/internal/core/tree"
)

type SyncResourcesInput struct{}

type SyncResourcesUseCase struct {
	kubeService kube.KubeService
	treeService tree.TreeService
	kubeStore   kube.KubeStore
	logger      logging.PhiLogger
}

func NewSyncResourcesUseCase(
	kubeService kube.KubeService,
	treeService tree.TreeService,
	kubeStore kube.KubeStore,
) shared.UseCase[SyncResourcesInput, map[string]*kube.Resource] {
	return &SyncResourcesUseCase{
		treeService: treeService,
		kubeService: kubeService,
		kubeStore:   kubeStore,
		logger:      *logging.Logger(),
	}
}

func (uc *SyncResourcesUseCase) Execute(in SyncResourcesInput) (map[string]*kube.Resource, error) {
	uc.logger.Info("Starting resource synchronization")

	// TODO: reset informers, reset watchers, etc.
	rm, err := uc.kubeService.DiscoverApis()
	if err != nil {
		uc.logger.WithError(err).Error("Error finding APIs")
		return nil, err
	}

	resources, err := uc.kubeService.DiscoverResources(rm)
	if err != nil {
		uc.logger.WithError(err).Error("Error getting resources")
		return nil, err
	}

	uc.logger.WithField("resource_count", len(resources)).Info("Discovered resources")
	uc.kubeStore.SetResources(resources)

	var root kube.Resource
	rootFound := false
	for _, resource := range resources {
		uc.kubeStore.RegisterResource(resource)
		if resource.Kind == "Kustomization" && resource.Name == "flux-system" && resource.Namespace == "flux-system" {
			root = *resource
			rootFound = true
		}
	}

	if !rootFound {
		uc.logger.Warn("Root Kustomization (flux-system) not found")
		return resources, nil
	}

	uc.logger.Debug("Root Kustomization (flux-system) found")

	rootKey := root.UID
	visited := map[string]bool{rootKey: true}
	root = uc.findChildrenRec(root, visited)
	uc.treeService.SetTree(root)

	uc.logger.Info("Resource synchronization completed")
	return resources, nil
}

func (uc *SyncResourcesUseCase) findChildrenRec(root kube.Resource, visited map[string]bool) kube.Resource {
	children := uc.kubeStore.FindChildrenResourcesByRef(root.GetRef())
	root.Children = nil
	for i := range children {
		child := children[i]
		key := child.UID
		if visited[key] {
			continue
		}
		visited[key] = true
		child = uc.findChildrenRec(child, visited)
		root.Children = append(root.Children, child)
	}
	return root
}
