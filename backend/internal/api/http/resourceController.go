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

	http.HandleFunc("/api/resource/{id}/describe", corsHandler(controller.HandleDescribe))
	http.HandleFunc("/api/resource/{id}/reconcile", corsHandler(controller.HandleReconcile))
	http.HandleFunc("/api/resource/{id}/suspend", corsHandler(controller.HandleSuspend))
	http.HandleFunc("/api/resource/{id}/resume", corsHandler(controller.HandleResume))
	http.HandleFunc("/api/events", corsHandler(controller.HandleEvents))

	return &controller
}

func (rc *ResourceController) HandleDescribe(w http.ResponseWriter, r *http.Request) {
	resourceUid := r.PathValue("id")
	if resourceUid == "" {
		http.Error(w, "Pod uid is required", http.StatusBadRequest)
		return
	}
	yamlData, err := rc.getResourceYAMLUseCase.Execute(resourceUid)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error getting resource: %v", err), http.StatusInternalServerError)
		return
	}

	// Set content type and write response
	w.Header().Set("Content-Type", "application/x-yaml")
	w.Write(yamlData)
}

func (rc *ResourceController) HandleReconcile(w http.ResponseWriter, r *http.Request) {
	resourceUid := r.PathValue("id")
	if resourceUid == "" {
		http.Error(w, "UID is required", http.StatusBadRequest)
		return
	}

	_, err := rc.reconcileUseCase.Execute(resourceUid)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error getting resource: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "success"}`))

}

func (rc *ResourceController) HandleSuspend(w http.ResponseWriter, r *http.Request) {
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
		http.Error(w, fmt.Sprintf("Error getting resource: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "success"}`))
}

func (rc *ResourceController) HandleResume(w http.ResponseWriter, r *http.Request) {
	resourceUid := r.PathValue("id")

	if resourceUid == "" {
		http.Error(w, "UID is required", http.StatusBadRequest)
		return
	}

	_, err := rc.resumeUseCase.Execute(kubernetesusecases.ResumeUseCaseInput{UID: resourceUid})
	if err != nil {
		http.Error(w, fmt.Sprintf("Error getting resource: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "success"}`))
}

func (rc *ResourceController) HandleEvents(w http.ResponseWriter, r *http.Request) {

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
		headers.Add("Access-Control-Allow-Origin", "*")
		headers.Add("Vary", "Origin")
		headers.Add("Vary", "Access-Control-Request-Method")
		headers.Add("Vary", "Access-Control-Request-Headers")
		headers.Add("Access-Control-Allow-Headers", "Content-Type, Origin, Accept, token")
		headers.Add("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		} else {
			f(w, r)
		}
	}
}
