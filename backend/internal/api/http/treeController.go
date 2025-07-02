package controllers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	shared "github.com/timp4w/phi/internal/core/shared"
	treeusecases "github.com/timp4w/phi/internal/core/tree/usecases"
)

type TreeController struct {
	getTreeUseCase shared.UseCase[treeusecases.GetTreeInput, *kube.Resource]
}

func NewTreeController(getTreeUseCase shared.UseCase[treeusecases.GetTreeInput, *kube.Resource]) *TreeController {
	controller := TreeController{
		getTreeUseCase: getTreeUseCase,
	}

	return &controller
}

// RegisterRoutes registers the tree routes
func (tc *TreeController) RegisterRoutes(r chi.Router) {
	r.Get("/api/tree", tc.GetTree)
}

// GetTree godoc
// @Summary Get tree
// @Produce json
// @Success 200 {object} kube.Resource
// @Router /api/tree [get]
func (tc *TreeController) GetTree(w http.ResponseWriter, r *http.Request) {
	tree, error := tc.getTreeUseCase.Execute(struct{}{})
	if error != nil {
		http.Error(w, error.Error(), http.StatusInternalServerError)
		return
	}
	treeJSON, err := json.Marshal(tree)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(treeJSON)
}
