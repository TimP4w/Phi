package mcp

import (
	"context"
	"fmt"
	"strings"

	mcplib "github.com/mark3labs/mcp-go/mcp"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	kubernetesusecases "github.com/timp4w/phi/internal/core/kubernetes/usecases"
	"github.com/timp4w/phi/internal/core/metrics"
	shared "github.com/timp4w/phi/internal/core/shared"
	"github.com/xlab/treeprint"
)

type mcpTools struct {
	store           kube.KubeStore
	getResourceYAML shared.UseCase[kubernetesusecases.GetResourceYAMLInput, []byte]
	reconcileUC     shared.UseCase[kubernetesusecases.ReconcileInput, struct{}]
	suspendUC       shared.UseCase[kubernetesusecases.SuspendUseCaseInput, struct{}]
	resumeUC        shared.UseCase[kubernetesusecases.ResumeUseCaseInput, struct{}]
	getEventsUC     shared.UseCase[kubernetesusecases.GetEventsInput, []kube.Event]
	metricsSvc      metrics.MetricsService
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
		fmt.Fprintf(&sb, "%s/%s (uid: %s, namespace: %s, status: %s, flux: %v)\n",
			r.Kind, r.Name, r.UID, r.Namespace, r.Status, r.IsFluxManaged)
		count++
	}

	if count == 0 {
		return mcplib.NewToolResultText("No resources found matching the given filters."), nil
	}
	return mcplib.NewToolResultText(fmt.Sprintf("Found %d resource(s):\n\n%s", count, sb.String())), nil
}

func (t *mcpTools) getResource(_ context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	uid := getStringArg(req.GetArguments(), "uid")
	if uid == "" {
		return nil, fmt.Errorf("uid is required")
	}

	resource := t.store.GetResourceByUID(uid)
	if resource == nil {
		return nil, fmt.Errorf("resource not found: %s", uid)
	}

	yamlBytes, err := t.getResourceYAML.Execute(kubernetesusecases.GetResourceYAMLInput{ResourceUid: uid})
	if err != nil {
		yamlBytes = []byte(fmt.Sprintf("(could not fetch YAML: %v)", err))
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "Kind: %s\nName: %s\nNamespace: %s\nStatus: %s\nIsFluxManaged: %v\n",
		resource.Kind, resource.Name, resource.Namespace, resource.Status, resource.IsFluxManaged)

	if resource.IsFluxManaged {
		fmt.Fprintf(&sb, "IsSuspended: %v\nIsReconciling: %v\n",
			resource.FluxMetadata.IsSuspended, resource.FluxMetadata.IsReconciling)
	}

	if len(resource.Conditions) > 0 {
		sb.WriteString("\nConditions:\n")
		for _, c := range resource.Conditions {
			fmt.Fprintf(&sb, "  - %s: %s — %s: %s\n", c.Type, c.Status, c.Reason, c.Message)
		}
	}

	if events := t.store.GetEventsByResourceUID(uid); len(events) > 0 {
		sb.WriteString("\nRecent Events:\n")
		for _, e := range events {
			fmt.Fprintf(&sb, "  - %s (%s): %s\n", e.Reason, e.LastObserved.Format("2006-01-02 15:04"), e.Message)
		}
	}

	sb.WriteString("\nYAML:\n")
	sb.Write(yamlBytes)

	return mcplib.NewToolResultText(sb.String()), nil
}

func (t *mcpTools) getTree(_ context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	uid := getStringArg(req.GetArguments(), "uid")
	if uid == "" {
		return nil, fmt.Errorf("uid is required")
	}

	resource := t.store.GetResourceByUID(uid)
	if resource == nil {
		return nil, fmt.Errorf("resource not found: %s", uid)
	}

	tree := treeprint.New()
	tree.SetValue(fmt.Sprintf("%s/%s (%s)", resource.Kind, resource.Name, resource.Status))
	t.addChildrenToTree(tree, *resource, map[string]struct{}{resource.UID: {}})

	return mcplib.NewToolResultText(tree.String()), nil
}

// addChildrenToTree resolves the children of parent via the store's ref index
// (Resource.Children is never populated on stored resources) and recurses.
// visited guards against cycles in the ownership graph.
func (t *mcpTools) addChildrenToTree(node treeprint.Tree, parent kube.Resource, visited map[string]struct{}) {
	for _, child := range t.store.FindChildrenResourcesByRef(parent.GetRef()) {
		if _, seen := visited[child.UID]; seen {
			continue
		}
		visited[child.UID] = struct{}{}
		branch := node.AddBranch(fmt.Sprintf("%s/%s (%s)", child.Kind, child.Name, child.Status))
		t.addChildrenToTree(branch, child, visited)
	}
}

func (t *mcpTools) diagnoseResource(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	uid := getStringArg(req.GetArguments(), "uid")
	if uid == "" {
		return nil, fmt.Errorf("uid is required")
	}

	resource := t.store.GetResourceByUID(uid)
	if resource == nil {
		return nil, fmt.Errorf("resource not found: %s", uid)
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "Resource: %s/%s (namespace: %s)\nStatus: %s\n",
		resource.Kind, resource.Name, resource.Namespace, resource.Status)

	var failing []kube.Condition
	for _, c := range resource.Conditions {
		if c.Status != "True" {
			failing = append(failing, c)
		}
	}
	if len(failing) > 0 {
		sb.WriteString("\nFailing Conditions:\n")
		for _, c := range failing {
			fmt.Fprintf(&sb, "  - %s: %s — %s: %s\n", c.Type, c.Status, c.Reason, c.Message)
		}
	} else {
		sb.WriteString("\nNo failing conditions.\n")
	}

	var errorEvents []kube.Event
	for _, e := range t.store.GetEventsByResourceUID(uid) {
		r := strings.ToLower(e.Reason)
		if strings.Contains(r, "error") || strings.Contains(r, "fail") || strings.Contains(r, "backoff") {
			errorEvents = append(errorEvents, e)
		}
	}
	if len(errorEvents) > 0 {
		sb.WriteString("\nError Events:\n")
		for _, e := range errorEvents {
			fmt.Fprintf(&sb, "  - %s (%s): %s\n", e.Reason, e.LastObserved.Format("2006-01-02 15:04"), e.Message)
		}
	}

	if len(resource.ParentIDs) > 0 {
		sb.WriteString("\nParent Resources:\n")
		for _, parentUID := range resource.ParentIDs {
			parent := t.store.GetResourceByUID(parentUID)
			if parent != nil {
				fmt.Fprintf(&sb, "  - %s/%s (status: %s)\n", parent.Kind, parent.Name, parent.Status)
			}
		}
	}

	t.appendUsageDiagnostics(ctx, &sb, uid)

	return mcplib.NewToolResultText(sb.String()), nil
}

func (t *mcpTools) getEvents(_ context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	args := req.GetArguments()
	nsFilter := getStringArg(args, "namespace")
	uidFilter := getStringArg(args, "uid")

	events, err := t.getEventsUC.Execute(kubernetesusecases.GetEventsInput{})
	if err != nil {
		return nil, fmt.Errorf("failed to get events: %w", err)
	}

	var sb strings.Builder
	count := 0
	for _, e := range events {
		if nsFilter != "" && e.Namespace != nsFilter {
			continue
		}
		if uidFilter != "" && e.ResourceUID != uidFilter {
			continue
		}
		fmt.Fprintf(&sb, "[%s] %s/%s: %s — %s\n",
			e.Namespace, e.Kind, e.Name, e.Reason, e.Message)
		count++
	}

	if count == 0 {
		return mcplib.NewToolResultText("No events found matching the given filters."), nil
	}
	return mcplib.NewToolResultText(fmt.Sprintf("Found %d event(s):\n\n%s", count, sb.String())), nil
}

func (t *mcpTools) reconcileResource(_ context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	uid := getStringArg(req.GetArguments(), "uid")
	if uid == "" {
		return nil, fmt.Errorf("uid is required")
	}

	_, err := t.reconcileUC.Execute(kubernetesusecases.ReconcileInput{ResourceUid: uid})
	if err != nil {
		return nil, err
	}

	return mcplib.NewToolResultText(fmt.Sprintf("reconciliation triggered for resource %s", uid)), nil
}

func (t *mcpTools) suspendResource(_ context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	uid := getStringArg(req.GetArguments(), "uid")
	if uid == "" {
		return nil, fmt.Errorf("uid is required")
	}

	_, err := t.suspendUC.Execute(kubernetesusecases.SuspendUseCaseInput{UID: uid})
	if err != nil {
		return nil, err
	}

	return mcplib.NewToolResultText(fmt.Sprintf("resource %s suspended", uid)), nil
}

func (t *mcpTools) resumeResource(_ context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
	uid := getStringArg(req.GetArguments(), "uid")
	if uid == "" {
		return nil, fmt.Errorf("uid is required")
	}

	_, err := t.resumeUC.Execute(kubernetesusecases.ResumeUseCaseInput{UID: uid})
	if err != nil {
		return nil, err
	}

	return mcplib.NewToolResultText(fmt.Sprintf("resource %s resumed", uid)), nil
}
