package mcp

import (
	"net/http"

	mcplib "github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	kubernetesusecases "github.com/timp4w/phi/internal/core/kubernetes/usecases"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type MCPServer struct {
	handler http.Handler
}

func NewMCPServer(
	getResourceYAML shared.UseCase[kubernetesusecases.GetResourceYAMLInput, []byte],
	reconcile shared.UseCase[kubernetesusecases.ReconcileInput, struct{}],
	suspend shared.UseCase[kubernetesusecases.SuspendUseCaseInput, struct{}],
	resume shared.UseCase[kubernetesusecases.ResumeUseCaseInput, struct{}],
	getEvents shared.UseCase[kubernetesusecases.GetEventsInput, []kube.Event],
	store kube.KubeStore,
) *MCPServer {
	tools := &mcpTools{
		store:           store,
		getResourceYAML: getResourceYAML,
		reconcileUC:     reconcile,
		suspendUC:       suspend,
		resumeUC:        resume,
		getEventsUC:     getEvents,
	}

	s := mcpserver.NewMCPServer("phi", "1.0.0")

	s.AddTool(mcplib.NewTool("list_resources",
		mcplib.WithDescription("List all Kubernetes and Flux resources in the cluster"),
		mcplib.WithString("namespace", mcplib.Description("Filter by namespace")),
		mcplib.WithString("kind", mcplib.Description("Filter by resource kind (e.g. Kustomization, HelmRelease)")),
		mcplib.WithString("status", mcplib.Description("Filter by status: success, failed, unknown")),
	), tools.listResources)

	s.AddTool(mcplib.NewTool("get_resource",
		mcplib.WithDescription("Get full details of a resource: YAML, conditions, events, and metadata"),
		mcplib.WithString("uid", mcplib.Required(), mcplib.Description("Resource UID")),
	), tools.getResource)

	s.AddTool(mcplib.NewTool("get_tree",
		mcplib.WithDescription("Get the dependency tree for a resource showing parent-child relationships"),
		mcplib.WithString("uid", mcplib.Required(), mcplib.Description("Resource UID")),
	), tools.getTree)

	s.AddTool(mcplib.NewTool("diagnose_resource",
		mcplib.WithDescription("Get a diagnostic bundle for a resource: failing conditions, error events, parent status. Use this to answer 'why is X not working?'"),
		mcplib.WithString("uid", mcplib.Required(), mcplib.Description("Resource UID")),
	), tools.diagnoseResource)

	s.AddTool(mcplib.NewTool("get_events",
		mcplib.WithDescription("Get recent cluster events"),
		mcplib.WithString("namespace", mcplib.Description("Filter by namespace")),
		mcplib.WithString("uid", mcplib.Description("Filter by resource UID")),
	), tools.getEvents)

	s.AddTool(mcplib.NewTool("reconcile_resource",
		mcplib.WithDescription("Trigger reconciliation of a Flux resource"),
		mcplib.WithString("uid", mcplib.Required(), mcplib.Description("Resource UID")),
	), tools.reconcileResource)

	s.AddTool(mcplib.NewTool("suspend_resource",
		mcplib.WithDescription("Suspend a Flux resource to stop reconciliation"),
		mcplib.WithString("uid", mcplib.Required(), mcplib.Description("Resource UID")),
	), tools.suspendResource)

	s.AddTool(mcplib.NewTool("resume_resource",
		mcplib.WithDescription("Resume a suspended Flux resource"),
		mcplib.WithString("uid", mcplib.Required(), mcplib.Description("Resource UID")),
	), tools.resumeResource)

	streamable := mcpserver.NewStreamableHTTPServer(s)
	return &MCPServer{handler: streamable}
}

func (m *MCPServer) Handler() http.Handler {
	return m.handler
}
