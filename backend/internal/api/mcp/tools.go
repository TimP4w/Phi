package mcp

import (
	"context"
	"fmt"
	"strings"

	mcplib "github.com/mark3labs/mcp-go/mcp"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	kubernetesusecases "github.com/timp4w/phi/internal/core/kubernetes/usecases"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type mcpTools struct {
	store           kube.KubeStore
	getResourceYAML shared.UseCase[kubernetesusecases.GetResourceYAMLInput, []byte]
	reconcileUC     shared.UseCase[kubernetesusecases.ReconcileInput, struct{}]
	suspendUC       shared.UseCase[kubernetesusecases.SuspendUseCaseInput, struct{}]
	resumeUC        shared.UseCase[kubernetesusecases.ResumeUseCaseInput, struct{}]
	getEventsUC     shared.UseCase[kubernetesusecases.GetEventsInput, []kube.Event]
}

// getStringArg reads a string tool argument by key from the arguments map.
func getStringArg(args map[string]interface{}, key string) string {
	if v, ok := args[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func (t *mcpTools) listResources(_ context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	args := req.GetArguments()
	nsFilter := getStringArg(args, "namespace")
	kindFilter := getStringArg(args, "kind")
	statusFilter := getStringArg(args, "status")

	resources := t.store.GetResources()

	var sb strings.Builder
	count := 0
	for _, r := range resources {
		if nsFilter != "" && r.Namespace != nsFilter {
			continue
		}
		if kindFilter != "" && !strings.EqualFold(r.Kind, kindFilter) {
			continue
		}
		if statusFilter != "" && !strings.EqualFold(string(r.Status), statusFilter) {
			continue
		}
		fmt.Fprintf(&sb, "%s/%s (namespace: %s, status: %s, flux: %v)\n",
			r.Kind, r.Name, r.Namespace, r.Status, r.IsFluxManaged)
		count++
	}

	if count == 0 {
		return mcplib.NewToolResultText("No resources found matching the given filters."), nil
	}
	return mcplib.NewToolResultText(fmt.Sprintf("Found %d resource(s):\n\n%s", count, sb.String())), nil
}

func (t *mcpTools) getResource(_ context.Context, _ mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	return mcplib.NewToolResultText("not implemented"), nil
}

func (t *mcpTools) getTree(_ context.Context, _ mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	return mcplib.NewToolResultText("not implemented"), nil
}

func (t *mcpTools) diagnoseResource(_ context.Context, _ mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	return mcplib.NewToolResultText("not implemented"), nil
}

func (t *mcpTools) getEvents(_ context.Context, _ mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	return mcplib.NewToolResultText("not implemented"), nil
}

func (t *mcpTools) reconcileResource(_ context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	return mcplib.NewToolResultText("not implemented"), nil
}

func (t *mcpTools) suspendResource(_ context.Context, _ mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	return mcplib.NewToolResultText("not implemented"), nil
}

func (t *mcpTools) resumeResource(_ context.Context, _ mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	return mcplib.NewToolResultText("not implemented"), nil
}
