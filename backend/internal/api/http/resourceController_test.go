package controllers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	kubernetesusecases "github.com/timp4w/phi/internal/core/kubernetes/usecases"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

// newResourceController wires a controller with fresh mocks for each use case and
// returns them so a test can program only the ones it exercises.
func newResourceController(t *testing.T) (
	*ResourceController,
	*mocks.UseCase[kubernetesusecases.GetResourceYAMLInput, []byte],
	*mocks.UseCase[kubernetesusecases.ReconcileInput, struct{}],
	*mocks.UseCase[kubernetesusecases.SuspendUseCaseInput, struct{}],
	*mocks.UseCase[kubernetesusecases.ResumeUseCaseInput, struct{}],
	*mocks.UseCase[kubernetesusecases.GetEventsInput, []kube.Event],
	*mocks.UseCase[kubernetesusecases.GetTrivyFindingsInput, kubernetesusecases.TrivyFindings],
) {
	yaml := mocks.NewUseCase[kubernetesusecases.GetResourceYAMLInput, []byte](t)
	reconcile := mocks.NewUseCase[kubernetesusecases.ReconcileInput, struct{}](t)
	suspend := mocks.NewUseCase[kubernetesusecases.SuspendUseCaseInput, struct{}](t)
	resume := mocks.NewUseCase[kubernetesusecases.ResumeUseCaseInput, struct{}](t)
	events := mocks.NewUseCase[kubernetesusecases.GetEventsInput, []kube.Event](t)
	trivy := mocks.NewUseCase[kubernetesusecases.GetTrivyFindingsInput, kubernetesusecases.TrivyFindings](t)
	rc := NewResourceController(yaml, reconcile, suspend, resume, events, trivy)
	return rc, yaml, reconcile, suspend, resume, events, trivy
}

// doRequest routes a request through a real chi router so URL params resolve the
// same way they do in production, rather than being hand-injected.
func doRequest(rc *ResourceController, method, target string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	rc.RegisterRoutes(r)
	req := httptest.NewRequest(method, target, nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestGetDescribe_Success(t *testing.T) {
	rc, yaml, _, _, _, _, _ := newResourceController(t)
	yaml.On("Execute", kubernetesusecases.GetResourceYAMLInput{ResourceUid: "abc"}).
		Return([]byte("kind: Pod\n"), nil)

	rec := doRequest(rc, http.MethodGet, "/api/resource/abc/describe")

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/x-yaml", rec.Header().Get("Content-Type"))
	assert.Equal(t, "kind: Pod\n", rec.Body.String())
}

func TestGetDescribe_NotFoundMapsTo404(t *testing.T) {
	rc, yaml, _, _, _, _, _ := newResourceController(t)
	yaml.On("Execute", kubernetesusecases.GetResourceYAMLInput{ResourceUid: "missing"}).
		Return([]byte(nil), kube.ErrNotFound)

	rec := doRequest(rc, http.MethodGet, "/api/resource/missing/describe")

	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestGetDescribe_GenericErrorMapsTo500(t *testing.T) {
	rc, yaml, _, _, _, _, _ := newResourceController(t)
	yaml.On("Execute", kubernetesusecases.GetResourceYAMLInput{ResourceUid: "boom"}).
		Return([]byte(nil), errors.New("kube exploded"))

	rec := doRequest(rc, http.MethodGet, "/api/resource/boom/describe")

	assert.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestPatchReconcile_Success(t *testing.T) {
	rc, _, reconcile, _, _, _, _ := newResourceController(t)
	reconcile.On("Execute", kubernetesusecases.ReconcileInput{ResourceUid: "abc"}).
		Return(struct{}{}, nil)

	rec := doRequest(rc, http.MethodPatch, "/api/resource/abc/reconcile")

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"status":"success"}`, rec.Body.String())
}

func TestPatchReconcile_NotFound(t *testing.T) {
	rc, _, reconcile, _, _, _, _ := newResourceController(t)
	reconcile.On("Execute", kubernetesusecases.ReconcileInput{ResourceUid: "x"}).
		Return(struct{}{}, kube.ErrNotFound)

	rec := doRequest(rc, http.MethodPatch, "/api/resource/x/reconcile")

	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestPatchSuspend_Success(t *testing.T) {
	rc, _, _, suspend, _, _, _ := newResourceController(t)
	suspend.On("Execute", kubernetesusecases.SuspendUseCaseInput{UID: "abc"}).
		Return(struct{}{}, nil)

	rec := doRequest(rc, http.MethodPatch, "/api/resource/abc/suspend")

	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestPatchSuspend_GenericError(t *testing.T) {
	rc, _, _, suspend, _, _, _ := newResourceController(t)
	suspend.On("Execute", kubernetesusecases.SuspendUseCaseInput{UID: "abc"}).
		Return(struct{}{}, errors.New("nope"))

	rec := doRequest(rc, http.MethodPatch, "/api/resource/abc/suspend")

	assert.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestPatchResume_Success(t *testing.T) {
	rc, _, _, _, resume, _, _ := newResourceController(t)
	resume.On("Execute", kubernetesusecases.ResumeUseCaseInput{UID: "abc"}).
		Return(struct{}{}, nil)

	rec := doRequest(rc, http.MethodPatch, "/api/resource/abc/resume")

	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestPatchResume_NotFound(t *testing.T) {
	rc, _, _, _, resume, _, _ := newResourceController(t)
	resume.On("Execute", kubernetesusecases.ResumeUseCaseInput{UID: "abc"}).
		Return(struct{}{}, kube.ErrNotFound)

	rec := doRequest(rc, http.MethodPatch, "/api/resource/abc/resume")

	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestGetEvents_Success(t *testing.T) {
	rc, _, _, _, _, events, _ := newResourceController(t)
	want := []kube.Event{{UID: "e1", Kind: "Pod", Name: "p", Reason: "Started"}}
	events.On("Execute", kubernetesusecases.GetEventsInput{}).Return(want, nil)

	rec := doRequest(rc, http.MethodGet, "/api/events")

	require.Equal(t, http.StatusOK, rec.Code)
	var got []kube.Event
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	assert.Equal(t, want, got)
}

func TestGetEvents_Error(t *testing.T) {
	rc, _, _, _, _, events, _ := newResourceController(t)
	events.On("Execute", kubernetesusecases.GetEventsInput{}).Return([]kube.Event(nil), errors.New("boom"))

	rec := doRequest(rc, http.MethodGet, "/api/events")

	assert.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestGetTrivyFindings_Success(t *testing.T) {
	rc, _, _, _, _, _, trivy := newResourceController(t)
	want := kubernetesusecases.TrivyFindings{}
	trivy.On("Execute", kubernetesusecases.GetTrivyFindingsInput{ResourceUid: "r1"}).Return(want, nil)

	rec := doRequest(rc, http.MethodGet, "/api/trivy/findings/r1")

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
}

func TestGetTrivyFindings_NotFound(t *testing.T) {
	rc, _, _, _, _, _, trivy := newResourceController(t)
	trivy.On("Execute", kubernetesusecases.GetTrivyFindingsInput{ResourceUid: "r1"}).
		Return(kubernetesusecases.TrivyFindings{}, kube.ErrNotFound)

	rec := doRequest(rc, http.MethodGet, "/api/trivy/findings/r1")

	assert.Equal(t, http.StatusNotFound, rec.Code)
}

// A blank id segment routes to a different path in chi (it is not matched), so the
// handler's own empty-id guard is exercised by calling it directly with an empty
// param rather than via the router.
func TestPatchReconcile_EmptyIDGuard(t *testing.T) {
	rc, _, _, _, _, _, _ := newResourceController(t)
	req := httptest.NewRequest(http.MethodPatch, "/api/resource//reconcile", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rec := httptest.NewRecorder()

	rc.PatchReconcile(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}
