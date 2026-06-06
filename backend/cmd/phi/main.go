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
	"go.uber.org/fx"

	httpSwagger "github.com/swaggo/http-swagger"

	_ "github.com/timp4w/phi/docs"
	controllers "github.com/timp4w/phi/internal/api/http"
	mcpapi "github.com/timp4w/phi/internal/api/mcp"
	wscontrollers "github.com/timp4w/phi/internal/api/ws"
	"github.com/timp4w/phi/internal/core/kubernetes"
	kubernetesusecases "github.com/timp4w/phi/internal/core/kubernetes/usecases"
	"github.com/timp4w/phi/internal/core/realtime"
	realtimeusecases "github.com/timp4w/phi/internal/core/realtime/usecases"
	shared "github.com/timp4w/phi/internal/core/shared"
	kubeInfra "github.com/timp4w/phi/internal/infrastructure/kubernetes"
	websocket "github.com/timp4w/phi/internal/infrastructure/websockets"
)

type UseCases struct {
	fx.In
	SyncResources     shared.UseCase[kubernetesusecases.SyncResourcesInput, map[string]*kubernetes.Resource]
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
			websocket.NewWebSocketManager,
			kubernetes.NewFluxServiceImpl,

			// Usecase providers
			kubernetesusecases.NewSyncResourcesUseCase,
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
				func() *string { return port },
				fx.ResultTags(`name:"port"`),
			),
		),
		fx.Provide(mcpapi.NewMCPServer),
		fx.Invoke(registerApp),
	)
	app.Run()
}

func registerApp(useCases UseCases, realtimeService realtime.RealtimeService, mcpSrv *mcpapi.MCPServer, lifecycle fx.Lifecycle, p struct {
	fx.In
	Port *string `name:"port"`
}) {
	logging.Info("Registering application components")
	initBackgroundTasks(useCases)
	r := createRouter(useCases, realtimeService, mcpSrv)
	registerServerLifecycle(lifecycle, r, *p.Port)
}

// initBackgroundTasks starts necessary background use cases
func initBackgroundTasks(uc UseCases) {
	logger := logging.Logger()
	logger.Info("Initializing background tasks")

	logger.Debug("Starting resource synchronization")
	if _, err := uc.SyncResources.Execute(struct{}{}); err != nil {
		logger.WithError(err).Error("Resource synchronization failed; watchers will start with empty store")
	}

	logger.Debug("Starting resource watching")
	uc.WatchResources.Execute(struct{}{})

	logger.Debug("Starting events watching")
	uc.WatchEvents.Execute(struct{}{})

	logger.Info("All background tasks initialized")
}

// createRouter initializes and configures the HTTP router
func createRouter(uc UseCases, realtimeService realtime.RealtimeService, mcpSrv *mcpapi.MCPServer) *chi.Mux {
	logger := logging.Logger()
	logger.Info("Creating router")

	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	// Register API controllers and routes
	registerAPIRoutes(r, uc, realtimeService, mcpSrv)

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

func registerAPIRoutes(r *chi.Mux, uc UseCases, realtimeService realtime.RealtimeService, mcpSrv *mcpapi.MCPServer) {
	staticController := controllers.NewStaticController()
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
	resourceController.RegisterRoutes(r)
	realtimeController.RegisterRoutes(r)
	staticController.RegisterRoutes(r)

	// Swagger documentation
	r.Handle("/swagger/*", httpSwagger.WrapHandler)

	r.Mount("/mcp", mcpSrv.Handler())
}

func registerServerLifecycle(lifecycle fx.Lifecycle, router http.Handler, port string) {
	logger := logging.Logger().WithField("port", port)

	var server *http.Server

	lifecycle.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			server = &http.Server{
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
			return server.Shutdown(ctx)
		},
	})
}
