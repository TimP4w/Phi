package shared

import (
	"sync"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/realtime"
	"github.com/timp4w/phi/internal/core/tree"
	kubeInfra "github.com/timp4w/phi/internal/infrastructure/kubernetes"
	websocket "github.com/timp4w/phi/internal/infrastructure/websockets"
)

var kubeServiceInstance kube.KubeService
var kubeServiceOnce sync.Once

func GetKubeService() kube.KubeService {
	kubeServiceOnce.Do(func() {
		kubeServiceInstance = kubeInfra.NewKubeServiceImpl()
	})
	return kubeServiceInstance
}

var kubeStoreInstance kube.KubeStore
var kubeStoreOnce sync.Once

func GetKubeStore() kube.KubeStore {
	kubeStoreOnce.Do(func() {
		kubeStoreInstance = kube.NewKubeStoreImpl()
	})
	return kubeStoreInstance
}

var treeServiceInstance tree.TreeService
var treeServiceOnce sync.Once

func GetTreeService() tree.TreeService {
	treeServiceOnce.Do(func() {
		treeServiceInstance = tree.NewTreeService()
	})
	return treeServiceInstance
}

var realtimeServiceInstance realtime.RealtimeService
var realtimeServiceeOnce sync.Once

func GetRealtimeService() realtime.RealtimeService {
	realtimeServiceeOnce.Do(func() {
		realtimeServiceInstance = websocket.NewWebSocketManager()
	})
	return realtimeServiceInstance
}
