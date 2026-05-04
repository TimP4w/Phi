package kubernetesusecases

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func TestResumeUseCase_Success(t *testing.T) {
	store := mocks.NewKubeStore(t)
	flux := mocks.NewFluxService(t)

	res := &kube.Resource{UID: "hr-uid", Kind: "HelmRelease", FluxMetadata: kube.FluxMetadata{IsSuspended: true}}
	store.On("GetResourceByUID", "hr-uid").Return(res)
	flux.On("Resume", *res).Return(res, nil)

	uc := NewResumeUseCase(flux, store)
	_, err := uc.Execute(ResumeUseCaseInput{UID: "hr-uid"})

	require.NoError(t, err)
	assert.False(t, res.FluxMetadata.IsSuspended)
}

func TestResumeUseCase_ResourceNotFound(t *testing.T) {
	store := mocks.NewKubeStore(t)
	flux := mocks.NewFluxService(t)

	store.On("GetResourceByUID", "missing").Return((*kube.Resource)(nil))

	uc := NewResumeUseCase(flux, store)
	_, err := uc.Execute(ResumeUseCaseInput{UID: "missing"})

	assert.ErrorContains(t, err, "not found")
	flux.AssertNotCalled(t, "Resume")
}

func TestResumeUseCase_ResumeFailed(t *testing.T) {
	store := mocks.NewKubeStore(t)
	flux := mocks.NewFluxService(t)

	res := &kube.Resource{UID: "hr-uid", Kind: "HelmRelease"}
	store.On("GetResourceByUID", "hr-uid").Return(res)
	flux.On("Resume", *res).Return((*kube.Resource)(nil), errors.New("not found"))

	uc := NewResumeUseCase(flux, store)
	_, err := uc.Execute(ResumeUseCaseInput{UID: "hr-uid"})

	assert.ErrorContains(t, err, "failed to resume")
}
