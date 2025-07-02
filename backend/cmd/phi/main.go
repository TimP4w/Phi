// @title Phi API
// @version 1.0
// @description API for managing Kubernetes resources
// @BasePath /
// @schemes http
// @host localhost:8080
package main

import (
	"context"
	"flag"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/tree"
	"go.uber.org/fx"

	httpSwagger "github.com/swaggo/http-swagger"

	_ "github.com/timp4w/phi/docs"
	controllers "github.com/timp4w/phi/internal/api/http"
	wscontrollers "github.com/timp4w/phi/internal/api/ws"
	"github.com/timp4w/phi/internal/core/kubernetes"
	kubernetesusecases "github.com/timp4w/phi/internal/core/kubernetes/usecases"
	"github.com/timp4w/phi/internal/core/realtime"
	realtimeusecases "github.com/timp4w/phi/internal/core/realtime/usecases"
	shared "github.com/timp4w/phi/internal/core/shared"
	treeusecases "github.com/timp4w/phi/internal/core/tree/usecases"
	kubeInfra "github.com/timp4w/phi/internal/infrastructure/kubernetes"
	websocket "github.com/timp4w/phi/internal/infrastructure/websockets"
)

type UseCases struct {
	fx.In
	SyncResources     shared.UseCase[kubernetesusecases.SyncResourcesInput, map[string]*kubernetes.Resource]
	GetTree           shared.UseCase[treeusecases.GetTreeInput, *kubernetes.Resource]
	WatchLogs         shared.UseCase[kubernetesusecases.WatchLogsUseCaseInput, struct{}]
	GetResourceYAML   shared.UseCase[kubernetesusecases.GetResourceYAMLInput, []byte]
	UpgradeConnection shared.UseCase[realtimeusecases.UpgradeConnectionInput, bool]
	WatchResources    shared.UseCase[kubernetesusecases.WatchResourcesInput, struct{}]
	WatchEvents       shared.UseCase[kubernetesusecases.WatchEventsInput, struct{}]
	Reconcile         shared.UseCase[kubernetesusecases.ReconcileInput, struct{}]
	Suspend           shared.UseCase[kubernetesusecases.SuspendUseCaseInput, struct{}]
	Resume            shared.UseCase[kubernetesusecases.ResumeUseCaseInput, struct{}]
	GetEvents         shared.UseCase[kubernetesusecases.GetEventsInput, []kubernetes.Event]
}

func main() {
	frontendDir := flag.String("frontend", "./frontend", "Path to frontend directory")
	port := flag.String("port", "8080", "Server port")
	logLevel := flag.String("log-level", "info", "Log level (debug, info, warn, error, fatal)")
	logJSON := flag.Bool("log-json", false, "Enable JSON logging")

	flag.Parse()

	// Initialize logger
	logging.Init(logging.Config{
		Level:       logging.LogLevel(*logLevel),
		Development: *logLevel == "debug",
		JSON:        *logJSON,
	})
	defer logging.Sync()

	logging.Info("Starting Phi application")

	app := fx.New(
		fx.Provide(
			// Service providers
			kubeInfra.NewKubeServiceImpl,
			kubernetes.NewKubeStoreImpl,
			tree.NewTreeService,
			websocket.NewWebSocketManager,
			kubernetes.NewFluxServiceImpl,

			// Usecase providers
			kubernetesusecases.NewSyncResourcesUseCase,
			treeusecases.NewGetTreeUseCase,
			kubernetesusecases.NewWatchLogsUseCase,
			kubernetesusecases.NewGetResourceYAMlUseCase,
			realtimeusecases.NewUpgradeConnectionUseCase,
			kubernetesusecases.NewReconcileUseCase,
			kubernetesusecases.NewSuspendUseCase,
			kubernetesusecases.NewResumeUseCase,
			kubernetesusecases.NewGetEventsUseCase,
			kubernetesusecases.NewWatchResourcesUseCase,
			kubernetesusecases.NewWatchEventsUseCase,

			fx.Annotate(
				func() *string { return frontendDir },
				fx.ResultTags(`name:"frontendDir"`),
			),
			fx.Annotate(
				func() *string { return port },
				fx.ResultTags(`name:"port"`),
			),
		),
		fx.Invoke(registerApp),
	)
	app.Run()
}

func registerApp(useCases UseCases, realtimeService realtime.RealtimeService, lifecycle fx.Lifecycle, p struct {
	fx.In
	FrontendDir *string `name:"frontendDir"`
	Port        *string `name:"port"`
}) {
	logging.Info("Registering application components")
	initBackgroundTasks(useCases)
	r := createRouter(useCases, realtimeService, *p.FrontendDir)
	registerServerLifecycle(lifecycle, r, *p.Port)
}

// initBackgroundTasks starts necessary background use cases
func initBackgroundTasks(uc UseCases) {
	logger := logging.Logger()
	logger.Info("Initializing background tasks")

	logger.Debug("Starting resource synchronization")
	uc.SyncResources.Execute(struct{}{})

	logger.Debug("Starting resource watching")
	uc.WatchResources.Execute(struct{}{})

	logger.Debug("Starting events watching")
	uc.WatchEvents.Execute(struct{}{})

	logger.Info("All background tasks initialized")
}

// createRouter initializes and configures the HTTP router
func createRouter(uc UseCases, realtimeService realtime.RealtimeService, frontendDir string) *chi.Mux {
	logger := logging.Logger()
	logger.Info("Creating router")

	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	// Register API controllers and routes
	registerAPIRoutes(r, uc, realtimeService, frontendDir)

	return r
}

// corsMiddleware handles CORS headers
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Requested-With")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func registerAPIRoutes(r *chi.Mux, uc UseCases, realtimeService realtime.RealtimeService, frontendDir string) {
	staticController := controllers.NewStaticController(frontendDir)
	treeController := controllers.NewTreeController(uc.GetTree)
	resourceController := controllers.NewResourceController(
		uc.GetResourceYAML,
		uc.Reconcile,
		uc.Suspend,
		uc.Resume,
		uc.GetEvents,
	)
	realtimeController := controllers.NewRealtimeController(uc.UpgradeConnection)

	// Register WebSocket controllers
	wscontrollers.NewResourceWSController(uc.WatchLogs, realtimeService)

	// Register routes
	treeController.RegisterRoutes(r)
	resourceController.RegisterRoutes(r)
	realtimeController.RegisterRoutes(r)
	staticController.RegisterRoutes(r)

	// Swagger documentation
	r.Handle("/swagger/*", httpSwagger.WrapHandler)
}

func registerServerLifecycle(lifecycle fx.Lifecycle, router http.Handler, port string) {
	logger := logging.Logger().WithField("port", port)

	lifecycle.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			server := &http.Server{
				Addr:         ":" + port,
				Handler:      router,
				ReadTimeout:  15 * time.Second,
				WriteTimeout: 15 * time.Second,
				IdleTimeout:  60 * time.Second,
			}

			go func() {
				logger.Info("Starting server")
				if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
					logger.WithError(err).Fatal("Could not start server")
				}
			}()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			logger.Info("Shutting down server")
			return nil
		},
	})
}
