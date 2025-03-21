package main

import (
	"flag"
	"log"
	"net/http"

	// _ "github.com/mkevac/debugcharts"

	controllers "github.com/timp4w/phi/internal/api/http"
	wscontrollers "github.com/timp4w/phi/internal/api/ws"
	kubernetesusecases "github.com/timp4w/phi/internal/core/kubernetes/usecases"
	realtimeusecases "github.com/timp4w/phi/internal/core/realtime/usecases"
	treeusecases "github.com/timp4w/phi/internal/core/tree/usecases"
)

func main() {
	frontendDir := flag.String("frontend", "./frontend", "Path to frontend directory")
	flag.Parse()

	// Init UseCases
	syncResourcesUseCase := kubernetesusecases.NewSyncResourcesUseCase()
	getTreeUseCase := treeusecases.NewGetTreeUseCase()
	watchLogsUseCase := kubernetesusecases.NewWatchLogsUseCase()

	getResourceYAMLUseCase := kubernetesusecases.NewGetResourceYAMlUseCase()
	upgradeConnectionUseCase := realtimeusecases.NewUpgradeConnectionUseCase()
	watchResourcesUseCase := kubernetesusecases.NewWatchResourcesUseCase()
	watchEventsuseCase := kubernetesusecases.NewWatchEventsUseCase()
	reconcileUseCase := kubernetesusecases.NewReconcileUseCase()
	suspendUseCase := kubernetesusecases.NewSuspendUseCase()
	resumeUseCase := kubernetesusecases.NewResumeUseCase()
	getEventsUseCase := kubernetesusecases.NewGetEventsUseCase()

	syncResourcesUseCase.Execute(struct{}{})
	watchResourcesUseCase.Execute(struct{}{})
	watchEventsuseCase.Execute(struct{}{})

	go func() {
		controllers.NewTreeController(getTreeUseCase)
		controllers.NewResourceController(getResourceYAMLUseCase, reconcileUseCase, suspendUseCase, resumeUseCase, getEventsUseCase)
		controllers.NewRealtimeController(upgradeConnectionUseCase)
		wscontrollers.NewResourceWSController(watchLogsUseCase)

		http.Handle("/", http.FileServer(http.Dir(*frontendDir)))

		log.Println("Starting server on :8080")

		if err := http.ListenAndServe(":8080", nil); err != nil {
			log.Fatalf("Could not start server: %s\n", err.Error())
		}
	}()

	select {}
}
