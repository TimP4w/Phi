package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	kubernetesusecases "github.com/timp4w/phi/internal/core/kubernetes/usecases"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type ResourceController struct {
	getResourceYAMLUseCase shared.UseCase[string, []byte]
	reconcileUseCase       shared.UseCase[string, struct{}]
	suspendUseCase         shared.UseCase[kubernetesusecases.SuspendUseCaseInput, struct{}]
	resumeUseCase          shared.UseCase[kubernetesusecases.ResumeUseCaseInput, struct{}]
	getEventsUseCase       shared.UseCase[struct{}, []kube.Event]
}

func NewResourceController(
	getResourceYAMLUseCase shared.UseCase[string, []byte],
	reconcileUseCase shared.UseCase[string, struct{}],
	suspendUseCase shared.UseCase[kubernetesusecases.SuspendUseCaseInput, struct{}],
	resumeUseCase shared.UseCase[kubernetesusecases.ResumeUseCaseInput, struct{}],
	getEventsUseCase shared.UseCase[struct{}, []kube.Event],
) *ResourceController {
	controller := ResourceController{
		getResourceYAMLUseCase: getResourceYAMLUseCase,
		reconcileUseCase:       reconcileUseCase,
		suspendUseCase:         suspendUseCase,
		resumeUseCase:          resumeUseCase,
		getEventsUseCase:       getEventsUseCase,
	}

	http.HandleFunc("/api/resource/{id}/describe", corsHandler(controller.GetDescribe))
	http.HandleFunc("/api/resource/{id}/reconcile", corsHandler(controller.PatchReconcile))
	http.HandleFunc("/api/resource/{id}/suspend", corsHandler(controller.PatchSuspend))
	http.HandleFunc("/api/resource/{id}/resume", corsHandler(controller.PatchResume))
	http.HandleFunc("/api/events", corsHandler(controller.GetEvents))

	return &controller
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
	yamlData, err := rc.getResourceYAMLUseCase.Execute(resourceUid)
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

	_, err := rc.reconcileUseCase.Execute(resourceUid)
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

func corsHandler(f func(w http.ResponseWriter, r *http.Request)) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		headers := w.Header()
		headers.Add("Access-Control-Allow-Origin", "*") // TODO: better allow origin?
		headers.Add("Vary", "Origin")
		headers.Add("Vary", "Access-Control-Request-Method")
		headers.Add("Vary", "Access-Control-Request-Headers")
		headers.Add("Access-Control-Allow-Headers", "Content-Type, Origin, Accept, token")
		headers.Add("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS") // TODO: we'll probably use DELETE at some point

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		} else {
			f(w, r)
		}
	}
}
