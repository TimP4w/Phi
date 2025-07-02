package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	kubernetesusecases "github.com/timp4w/phi/internal/core/kubernetes/usecases"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type ResourceController struct {
	getResourceYAMLUseCase shared.UseCase[kubernetesusecases.GetResourceYAMLInput, []byte]
	reconcileUseCase       shared.UseCase[kubernetesusecases.ReconcileInput, struct{}]
	suspendUseCase         shared.UseCase[kubernetesusecases.SuspendUseCaseInput, struct{}]
	resumeUseCase          shared.UseCase[kubernetesusecases.ResumeUseCaseInput, struct{}]
	getEventsUseCase       shared.UseCase[kubernetesusecases.GetEventsInput, []kube.Event]
}

func NewResourceController(
	getResourceYAMLUseCase shared.UseCase[kubernetesusecases.GetResourceYAMLInput, []byte],
	reconcileUseCase shared.UseCase[kubernetesusecases.ReconcileInput, struct{}],
	suspendUseCase shared.UseCase[kubernetesusecases.SuspendUseCaseInput, struct{}],
	resumeUseCase shared.UseCase[kubernetesusecases.ResumeUseCaseInput, struct{}],
	getEventsUseCase shared.UseCase[kubernetesusecases.GetEventsInput, []kube.Event],
) *ResourceController {
	controller := ResourceController{
		getResourceYAMLUseCase: getResourceYAMLUseCase,
		reconcileUseCase:       reconcileUseCase,
		suspendUseCase:         suspendUseCase,
		resumeUseCase:          resumeUseCase,
		getEventsUseCase:       getEventsUseCase,
	}

	return &controller
}

func (rc *ResourceController) RegisterRoutes(r chi.Router) {
	r.Get("/api/resource/{id}/describe", rc.GetDescribe)
	r.Patch("/api/resource/{id}/reconcile", rc.PatchReconcile)
	r.Patch("/api/resource/{id}/suspend", rc.PatchSuspend)
	r.Patch("/api/resource/{id}/resume", rc.PatchResume)
	r.Get("/api/events", rc.GetEvents)
}

// DescribeResource godoc
// @Summary Get describe YAML of a resource
// @Produce plain
// @Param id path string true "UUID"
// @Success 200 {object} string
// @Router /api/resource/{id}/describe [get]
func (rc *ResourceController) GetDescribe(w http.ResponseWriter, r *http.Request) {
	resourceUid := r.PathValue("id")
	if resourceUid == "" {
		http.Error(w, "Pod uid is required", http.StatusBadRequest)
		return
	}
	yamlData, err := rc.getResourceYAMLUseCase.Execute(kubernetesusecases.GetResourceYAMLInput{ResourceUid: resourceUid})
	if err != nil {
		// TODO: handle resource not found (404)
		http.Error(w, fmt.Sprintf("Error getting resource: %v", err), http.StatusInternalServerError)
		return
	}

	// Set content type and write response
	w.Header().Set("Content-Type", "application/x-yaml")
	w.Write(yamlData)
}

// ReconcileResource godoc
// @Summary Start the reconciliation of a resource that supports it
// @Produce json
// @Param id path string true "UUID"
// @Success 200 {object} string
// @Router /api/resource/{id}/reconcile [patch]
func (rc *ResourceController) PatchReconcile(w http.ResponseWriter, r *http.Request) {
	resourceUid := r.PathValue("id")
	if resourceUid == "" {
		http.Error(w, "UID is required", http.StatusBadRequest)
		return
	}

	_, err := rc.reconcileUseCase.Execute(kubernetesusecases.ReconcileInput{ResourceUid: resourceUid})
	if err != nil {
		// TODO: handle resource not found (404)
		http.Error(w, fmt.Sprintf("Error getting resource: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "success"}`))

}

// RSuspendResource godoc
// @Summary Suspend the reconciliation of a resource that supports it
// @Produce json
// @Param id path string true "UUID"
// @Success 200 {object} string
// @Router /api/resource/{id}/suspend [patch]
func (rc *ResourceController) PatchSuspend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	resourceUid := r.PathValue("id")
	if resourceUid == "" {
		http.Error(w, "UID is required", http.StatusBadRequest)
		return
	}

	_, err := rc.suspendUseCase.Execute(kubernetesusecases.SuspendUseCaseInput{UID: resourceUid})
	if err != nil {
		// TODO: handle resource not found (404)
		http.Error(w, fmt.Sprintf("Error getting resource: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "success"}`))
}

// ResumeResource godoc
// @Summary Resume the reconciliation of a resource that supports it
// @Produce json
// @Param id path string true "UUID"
// @Success 200 {object} string
// @Router /api/resource/{id}/resume [patch]
func (rc *ResourceController) PatchResume(w http.ResponseWriter, r *http.Request) {
	resourceUid := r.PathValue("id")

	if resourceUid == "" {
		http.Error(w, "UID is required", http.StatusBadRequest)
		return
	}

	_, err := rc.resumeUseCase.Execute(kubernetesusecases.ResumeUseCaseInput{UID: resourceUid})
	if err != nil {
		// TODO: handle resource not found (404)
		http.Error(w, fmt.Sprintf("Error getting resource: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "success"}`))
}

// GetEvents godoc
// @Summary Get events
// @Produce json
// @Success 200 {object} []kube.Event
// @Router /api/events [get]
func (rc *ResourceController) GetEvents(w http.ResponseWriter, r *http.Request) {
	events, err := rc.getEventsUseCase.Execute(struct{}{})
	if err != nil {
		http.Error(w, fmt.Sprintf("Error getting events: %v", err), http.StatusInternalServerError)
		return
	}
	jsonEvents, err := json.Marshal(events)
	if err != nil {
		http.Error(w, fmt.Sprintf("Could not marshal events: %v", err), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(jsonEvents)
}
