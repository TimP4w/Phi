package kubernetes_test

import (
	"encoding/json"
	"errors"
	"testing"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/types"
)

func reconcilableResource() kube.Resource {
	return kube.Resource{
		Kind:      "Kustomization",
		Name:      "my-ks",
		Namespace: "flux-system",
		UID:       "ks-uid-1",
	}
}

func suspendableResource() kube.Resource {
	return kube.Resource{
		Kind:      "HelmRelease",
		Name:      "my-hr",
		Namespace: "default",
		UID:       "hr-uid-1",
	}
}

func nonFluxResource() kube.Resource {
	return kube.Resource{
		Kind:      "Pod",
		Name:      "my-pod",
		Namespace: "default",
		UID:       "pod-uid-1",
	}
}

// ── Reconcile ─────────────────────────────────────────────────────────────────

func TestFluxService_Reconcile_Success(t *testing.T) {
	kubeSvc := mocks.NewKubeService(t)
	svc := kube.NewFluxServiceImpl(kubeSvc)

	res := reconcilableResource()
	returned := &kube.Resource{UID: res.UID, Name: res.Name}
	kubeSvc.On("PatchResource", mock.Anything).Return(returned, nil)

	got, err := svc.Reconcile(res)

	require.NoError(t, err)
	assert.Equal(t, returned, got)
	kubeSvc.AssertExpectations(t)
}

func TestFluxService_Reconcile_NotReconcilable(t *testing.T) {
	kubeSvc := mocks.NewKubeService(t)
	svc := kube.NewFluxServiceImpl(kubeSvc)

	_, err := svc.Reconcile(nonFluxResource())

	assert.ErrorContains(t, err, "not reconcilable")
	kubeSvc.AssertNotCalled(t, "PatchResource")
}

func TestFluxService_Reconcile_Suspended(t *testing.T) {
	kubeSvc := mocks.NewKubeService(t)
	svc := kube.NewFluxServiceImpl(kubeSvc)

	res := reconcilableResource()
	res.FluxMetadata.IsSuspended = true

	_, err := svc.Reconcile(res)

	assert.ErrorContains(t, err, "suspended")
	kubeSvc.AssertNotCalled(t, "PatchResource")
}

func TestFluxService_Reconcile_PatchFailed(t *testing.T) {
	kubeSvc := mocks.NewKubeService(t)
	svc := kube.NewFluxServiceImpl(kubeSvc)

	kubeSvc.On("PatchResource", mock.Anything).
		Return((*kube.Resource)(nil), errors.New("patch rejected"))

	_, err := svc.Reconcile(reconcilableResource())

	assert.ErrorContains(t, err, "failed to reconcile")
}

func TestFluxService_Reconcile_HelmRelease_HasForceAnnotation(t *testing.T) {
	kubeSvc := mocks.NewKubeService(t)
	svc := kube.NewFluxServiceImpl(kubeSvc)

	kubeSvc.On("PatchResource", mock.Anything).Return(&kube.Resource{}, nil)

	_, err := svc.Reconcile(suspendableResource())
	require.NoError(t, err)

	// Verify the patch JSON for HelmRelease contains the force annotation
	p := kube.ReconcilePatch{Resource: suspendableResource()}
	b, err := p.PatchJSON()
	require.NoError(t, err)

	var m map[string]interface{}
	require.NoError(t, json.Unmarshal(b, &m))

	annotations := m["metadata"].(map[string]interface{})["annotations"].(map[string]interface{})
	assert.Contains(t, annotations, "reconcile.fluxcd.io/forceAt")
}

// ── Suspend ───────────────────────────────────────────────────────────────────

func TestFluxService_Suspend_Success(t *testing.T) {
	kubeSvc := mocks.NewKubeService(t)
	svc := kube.NewFluxServiceImpl(kubeSvc)

	res := suspendableResource()
	returned := &kube.Resource{UID: res.UID}
	kubeSvc.On("PatchResource", mock.Anything).Return(returned, nil)

	got, err := svc.Suspend(res)

	require.NoError(t, err)
	assert.Equal(t, returned, got)
}

func TestFluxService_Suspend_NotSuspendable(t *testing.T) {
	kubeSvc := mocks.NewKubeService(t)
	svc := kube.NewFluxServiceImpl(kubeSvc)

	_, err := svc.Suspend(nonFluxResource())

	assert.ErrorContains(t, err, "not suspendable")
	kubeSvc.AssertNotCalled(t, "PatchResource")
}

func TestFluxService_Suspend_PatchFailed(t *testing.T) {
	kubeSvc := mocks.NewKubeService(t)
	svc := kube.NewFluxServiceImpl(kubeSvc)

	kubeSvc.On("PatchResource", mock.Anything).
		Return((*kube.Resource)(nil), errors.New("conflict"))

	_, err := svc.Suspend(suspendableResource())

	assert.ErrorContains(t, err, "failed to suspend")
}

// ── Resume ────────────────────────────────────────────────────────────────────

func TestFluxService_Resume_Success(t *testing.T) {
	kubeSvc := mocks.NewKubeService(t)
	svc := kube.NewFluxServiceImpl(kubeSvc)

	res := suspendableResource()
	returned := &kube.Resource{UID: res.UID}
	kubeSvc.On("PatchResource", mock.Anything).Return(returned, nil)

	got, err := svc.Resume(res)

	require.NoError(t, err)
	assert.Equal(t, returned, got)
}

func TestFluxService_Resume_NotSuspendable(t *testing.T) {
	kubeSvc := mocks.NewKubeService(t)
	svc := kube.NewFluxServiceImpl(kubeSvc)

	_, err := svc.Resume(nonFluxResource())

	assert.ErrorContains(t, err, "not suspendable")
	kubeSvc.AssertNotCalled(t, "PatchResource")
}

func TestFluxService_Resume_PatchFailed(t *testing.T) {
	kubeSvc := mocks.NewKubeService(t)
	svc := kube.NewFluxServiceImpl(kubeSvc)

	kubeSvc.On("PatchResource", mock.Anything).
		Return((*kube.Resource)(nil), errors.New("not found"))

	_, err := svc.Resume(suspendableResource())

	assert.Error(t, err)
}

// ── Patch type unit tests ─────────────────────────────────────────────────────

func TestReconcilePatch_PatchType(t *testing.T) {
	p := kube.ReconcilePatch{Resource: reconcilableResource()}
	assert.Equal(t, types.MergePatchType, p.PatchType())
}

func TestReconcilePatch_PatchJSON_ContainsAnnotation(t *testing.T) {
	p := kube.ReconcilePatch{Resource: reconcilableResource()}
	b, err := p.PatchJSON()
	require.NoError(t, err)

	var m map[string]interface{}
	require.NoError(t, json.Unmarshal(b, &m))

	annotations := m["metadata"].(map[string]interface{})["annotations"].(map[string]interface{})
	assert.Contains(t, annotations, "reconcile.fluxcd.io/requestedAt")
}

func TestReconcilePatch_ResourceMeta(t *testing.T) {
	res := reconcilableResource()
	p := kube.ReconcilePatch{Resource: res}
	assert.Equal(t, res, p.ResourceMeta())
}

func TestSuspendPatch_PatchJSON(t *testing.T) {
	p := kube.SuspendPatch{Resource: suspendableResource()}
	b, err := p.PatchJSON()
	require.NoError(t, err)

	var m map[string]interface{}
	require.NoError(t, json.Unmarshal(b, &m))

	assert.Equal(t, true, m["spec"].(map[string]interface{})["suspend"])
}

func TestSuspendPatch_PatchType(t *testing.T) {
	assert.Equal(t, types.MergePatchType, kube.SuspendPatch{}.PatchType())
}

func TestResumePatch_PatchJSON(t *testing.T) {
	p := kube.ResumePatch{Resource: suspendableResource()}
	b, err := p.PatchJSON()
	require.NoError(t, err)

	var m map[string]interface{}
	require.NoError(t, json.Unmarshal(b, &m))

	assert.Equal(t, false, m["spec"].(map[string]interface{})["suspend"])
}

func TestResumePatch_PatchType(t *testing.T) {
	assert.Equal(t, types.MergePatchType, kube.ResumePatch{}.PatchType())
}
