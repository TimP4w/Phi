package kubernetesusecases

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func TestSuspendUseCase_Success(t *testing.T) {
	store := mocks.NewKubeStore(t)
	flux := mocks.NewFluxService(t)

	res := &kube.Resource{UID: "hr-uid", Kind: "HelmRelease"}
	store.On("GetResourceByUID", "hr-uid").Return(res)
	flux.On("Suspend", *res).Return(res, nil)

	uc := NewSuspendUseCase(flux, store)
	_, err := uc.Execute(SuspendUseCaseInput{UID: "hr-uid"})

	require.NoError(t, err)
	assert.True(t, res.FluxMetadata.IsSuspended)
}

func TestSuspendUseCase_ResourceNotFound(t *testing.T) {
	store := mocks.NewKubeStore(t)
	flux := mocks.NewFluxService(t)

	store.On("GetResourceByUID", "missing").Return((*kube.Resource)(nil))

	uc := NewSuspendUseCase(flux, store)
	_, err := uc.Execute(SuspendUseCaseInput{UID: "missing"})

	assert.ErrorContains(t, err, "not found")
	flux.AssertNotCalled(t, "Suspend")
}

func TestSuspendUseCase_SuspendFailed(t *testing.T) {
	store := mocks.NewKubeStore(t)
	flux := mocks.NewFluxService(t)

	res := &kube.Resource{UID: "hr-uid", Kind: "HelmRelease"}
	store.On("GetResourceByUID", "hr-uid").Return(res)
	flux.On("Suspend", *res).Return((*kube.Resource)(nil), errors.New("conflict"))

	uc := NewSuspendUseCase(flux, store)
	_, err := uc.Execute(SuspendUseCaseInput{UID: "hr-uid"})

	assert.ErrorContains(t, err, "failed to suspend")
}
