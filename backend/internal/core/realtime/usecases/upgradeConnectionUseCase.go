package realtimeusecases

import (
	"net/http"

	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
)

type UpgradeConnectionUseCase struct {
	realtimeService realtime.RealtimeService
}

type UpgradeConnectionInput struct {
	W http.ResponseWriter
	R *http.Request
}

func NewUpgradeConnectionUseCase() shared.UseCase[UpgradeConnectionInput, bool] {
	return &UpgradeConnectionUseCase{
		realtimeService: shared.GetRealtimeService(),
	}
}

func (uc *UpgradeConnectionUseCase) Execute(input UpgradeConnectionInput) (bool, error) {
	_, err := uc.realtimeService.Upgrade(input.W, input.R)
	if err != nil {
		return false, err
	}
	return true, nil
}
