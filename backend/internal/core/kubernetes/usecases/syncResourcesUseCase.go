package kubernetesusecases

import (
	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	shared "github.com/timp4w/phi/internal/core/shared"
	"github.com/timp4w/phi/internal/core/tree"
)

type SyncResourcesInput struct{}

type SyncResourcesUseCase struct {
	kubeService kubernetes.KubeService
	treeService tree.TreeService
	kubeStore   kubernetes.KubeStore
	logger      logging.PhiLogger
}

func NewSyncResourcesUseCase(
	kubeService kubernetes.KubeService,
	treeService tree.TreeService,
	kubeStore kubernetes.KubeStore,
) shared.UseCase[SyncResourcesInput, map[string]*kubernetes.Resource] {
	return &SyncResourcesUseCase{
		treeService: treeService,
		kubeService: kubeService,
		kubeStore:   kubeStore,
		logger:      *logging.Logger(),
	}
}

func (uc *SyncResourcesUseCase) Execute(in SyncResourcesInput) (map[string]*kubernetes.Resource, error) {
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
	}

	uc.logger.WithField("resource_count", len(resources)).Info("Discovered resources")
	uc.kubeStore.SetResources(resources)

	var root kubernetes.Resource
	rootFound := false
	for _, resource := range resources {
		uc.kubeStore.RegisterResource(resource)
		if resource.Kind == "Kustomization" && resource.Name == "flux-system" {
			root = *resource
			rootFound = true
		}
	}

	if !rootFound {
		uc.logger.Warn("Root Kustomization (flux-system) not found")
	} else {
		uc.logger.Debug("Root Kustomization (flux-system) found")
	}

	visited := make(map[string]bool)
	visited[root.GetRef()] = true
	uc.findChildrenRec(&root, visited)
	uc.treeService.SetTree(root)

	uc.logger.Info("Resource synchronization completed")
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
