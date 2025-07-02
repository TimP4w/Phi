package controllers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	realtimeusecases "github.com/timp4w/phi/internal/core/realtime/usecases"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type RealtimeController struct {
	upgradeConnectionUseCase shared.UseCase[realtimeusecases.UpgradeConnectionInput, bool]
}

func NewRealtimeController(upgradeConnectionUseCase shared.UseCase[realtimeusecases.UpgradeConnectionInput, bool]) *RealtimeController {
	controller := RealtimeController{
		upgradeConnectionUseCase: upgradeConnectionUseCase,
	}

	return &controller
}

func (rc *RealtimeController) RegisterRoutes(r chi.Router) {
	r.Get("/ws", rc.HandleWs)
}

func (rc *RealtimeController) HandleWs(w http.ResponseWriter, r *http.Request) {
	input := realtimeusecases.UpgradeConnectionInput{
		W: w,
		R: r,
	}
	_, err := rc.upgradeConnectionUseCase.Execute(input)
	if err != nil {
		http.Error(w, "Something Went Wrong", http.StatusInternalServerError)
		return
	}
}
