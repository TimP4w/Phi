package controllers

import (
	"encoding/json"
	"net/http"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type TreeController struct {
	getTreeUseCase shared.UseCase[struct{}, *kube.Resource]
}

func NewTreeController(getTreeUseCase shared.UseCase[struct{}, *kube.Resource]) *TreeController {
	controller := TreeController{
		getTreeUseCase: getTreeUseCase,
	}

	http.HandleFunc("/api/tree", controller.GetTree)
	return &controller
}

// GetTree godoc
// @Summary Get tree
// @Produce json
// @Success 200 {object} kube.Resource
// @Router /api/tree [get]
func (tc *TreeController) GetTree(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

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
