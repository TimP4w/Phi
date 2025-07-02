package realtimeusecases

import (
	"net/http"

	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/realtime"
	shared "github.com/timp4w/phi/internal/core/shared"
	"go.uber.org/fx"
)

type UpgradeConnectionUseCase struct {
	realtimeService realtime.RealtimeService
	logger          logging.PhiLogger
}

type UpgradeConnectionInput struct {
	W http.ResponseWriter
	R *http.Request
}

type UpgradeConnectionUseCaseParams struct {
	fx.In
	RealtimeService realtime.RealtimeService
}

func NewUpgradeConnectionUseCase(p UpgradeConnectionUseCaseParams) shared.UseCase[UpgradeConnectionInput, bool] {
	return &UpgradeConnectionUseCase{
		realtimeService: p.RealtimeService,
		logger:          *logging.Logger(),
	}
}

func (uc *UpgradeConnectionUseCase) Execute(input UpgradeConnectionInput) (bool, error) {
	_, err := uc.realtimeService.Upgrade(input.W, input.R)
	if err != nil {
		uc.logger.WithError(err).Error("Error upgrading the connection")
		return false, err
	}
	return true, nil
}
