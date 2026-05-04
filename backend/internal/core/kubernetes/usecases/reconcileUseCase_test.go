package kubernetesusecases

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func TestReconcileUseCase_Success(t *testing.T) {
	store := mocks.NewKubeStore(t)
	flux := mocks.NewFluxService(t)

	res := &kube.Resource{UID: "ks-uid", Kind: "Kustomization"}
	store.On("GetResourceByUID", "ks-uid").Return(res)
	flux.On("Reconcile", *res).Return(res, nil)

	uc := NewReconcileUseCase(flux, store)
	_, err := uc.Execute(ReconcileInput{ResourceUid: "ks-uid"})

	require.NoError(t, err)
	assert.True(t, res.FluxMetadata.IsReconciling)
	store.AssertExpectations(t)
	flux.AssertExpectations(t)
}

func TestReconcileUseCase_ResourceNotFound(t *testing.T) {
	store := mocks.NewKubeStore(t)
	flux := mocks.NewFluxService(t)

	store.On("GetResourceByUID", "missing").Return((*kube.Resource)(nil))

	uc := NewReconcileUseCase(flux, store)
	_, err := uc.Execute(ReconcileInput{ResourceUid: "missing"})

	assert.ErrorContains(t, err, "not found")
	flux.AssertNotCalled(t, "Reconcile")
}

func TestReconcileUseCase_ReconcileFailed(t *testing.T) {
	store := mocks.NewKubeStore(t)
	flux := mocks.NewFluxService(t)

	res := &kube.Resource{UID: "ks-uid", Kind: "Kustomization"}
	store.On("GetResourceByUID", "ks-uid").Return(res)
	flux.On("Reconcile", *res).Return((*kube.Resource)(nil), errors.New("api error"))

	uc := NewReconcileUseCase(flux, store)
	_, err := uc.Execute(ReconcileInput{ResourceUid: "ks-uid"})

	assert.ErrorContains(t, err, "failed to reconcile")
}
