package controllers

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"

	realtimeusecases "github.com/timp4w/phi/internal/core/realtime/usecases"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

// anyUpgradeInput matches any UpgradeConnectionInput, since W/R carry runtime
// request objects we don't control the identity of.
func anyUpgradeInput() interface{} {
	return mock.MatchedBy(func(realtimeusecases.UpgradeConnectionInput) bool { return true })
}

func TestHandleWs_UpgradeFailureMapsTo500(t *testing.T) {
	uc := mocks.NewUseCase[realtimeusecases.UpgradeConnectionInput, bool](t)
	uc.On("Execute", anyUpgradeInput()).Return(false, errors.New("upgrade failed"))

	rc := NewRealtimeController(uc)
	r := chi.NewRouter()
	rc.RegisterRoutes(r)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ws", nil))

	assert.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestHandleWs_SuccessLeavesResponseToUseCase(t *testing.T) {
	uc := mocks.NewUseCase[realtimeusecases.UpgradeConnectionInput, bool](t)
	// On success the handler writes nothing itself (the upgrade hijacks the conn),
	// so the recorder keeps its default 200 and an empty body.
	uc.On("Execute", anyUpgradeInput()).Return(true, nil)

	rc := NewRealtimeController(uc)
	r := chi.NewRouter()
	rc.RegisterRoutes(r)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ws", nil))

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Empty(t, rec.Body.String())
}
