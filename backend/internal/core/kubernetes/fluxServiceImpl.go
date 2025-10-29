package kubernetes

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/fluxcd/pkg/apis/meta"
	"github.com/timp4w/phi/internal/core/logging"

	helmv2 "github.com/fluxcd/helm-controller/api/v2"
)

type FluxServiceImpl struct {
	kubeService KubeService
}

var _ FluxService = (*FluxServiceImpl)(nil)

func NewFluxServiceImpl(KubeService KubeService) FluxService {
	logger := logging.Logger()
	logger.Debug("Creating new FluxServiceImpl")

	service := &FluxServiceImpl{
		kubeService: KubeService,
	}

	return service
}

func (k *FluxServiceImpl) Reconcile(resource Resource) (*Resource, error) {
	logger := logging.Logger().WithResource(resource.Kind, resource.Name, resource.Namespace, resource.UID)

	logger.WithFields(map[string]interface{}{
		"is_reconcilable": resource.IsReconcilable(),
		"is_suspended":    resource.FluxMetadata.IsSuspended,
		"resource_data":   resource,
	}).Debug("Starting reconcile operation")

	if !resource.IsReconcilable() {
		logger.Warn("Resource is not reconcilable")
		return nil, fmt.Errorf("resource is not reconcilable")
	}

	if resource.FluxMetadata.IsSuspended {
		logger.Warn("Resource is suspended and cannot be reconciled")
		return nil, fmt.Errorf("resource is suspended and cannot be reconciled")
	}

	patch := ReconcilePatch{
		Resource: resource,
	}

	/* TODO: Check if this is needed
	https://github.com/fluxcd/flux2/blob/main/cmd/flux/reconcile_helmrelease.go#L58
	https://github.com/fluxcd/flux2/blob/437a94367784541695fa68deba7a52b188d97ea8/cmd/flux/reconcile.go#L180
		if element.Kind == "HelmRelease" {
			if rhrArgs.syncReset {
				annotations[helmv2.ResetRequestAnnotation] = ts
			}
		}
	*/

	patchedResource, err := k.kubeService.PatchResource(patch)
	if err != nil {
		logger.WithError(err).Error("Failed to reconcile resource")
		return nil, fmt.Errorf("failed to reconcile resource: %w", err)
	}

	logger.WithField("patched_resource", patchedResource).Debug("Successfully reconciled resource")
	return patchedResource, nil
}

func (k *FluxServiceImpl) Suspend(resource Resource) (*Resource, error) {
	logger := logging.Logger().WithResource(resource.Kind, resource.Name, resource.Namespace, resource.UID)

	if !resource.IsSuspendable() {
		logger.Warn("Resource is not suspendable")
		return nil, fmt.Errorf("resource is not suspendable")
	}

	patch := SuspendPatch{Resource: resource}
	res, err := k.kubeService.PatchResource(patch)
	if err != nil {
		return nil, fmt.Errorf("failed to suspend resource: %v", err)
	}
	return res, nil
}

func (k *FluxServiceImpl) Resume(resource Resource) (*Resource, error) {
	logger := logging.Logger().WithResource(resource.Kind, resource.Name, resource.Namespace, resource.UID)

	if !resource.IsSuspendable() {
		logger.Warn("Resource is not suspendable")
		return nil, fmt.Errorf("resource is not suspendable")
	}

	patch := ResumePatch{Resource: resource}
	res, err := k.kubeService.PatchResource(patch)
	if err != nil {
		return nil, fmt.Errorf("failed to suspend resource: %v", err)
	}
	return res, nil
}

type SuspendPatch struct {
	Resource Resource
}

func (s SuspendPatch) ResourceMeta() Resource {
	return s.Resource
}

func (s SuspendPatch) PatchJSON() ([]byte, error) {
	patch := map[string]interface{}{
		"spec": map[string]interface{}{
			"suspend": true,
		},
	}
	return json.Marshal(patch)
}

func (s SuspendPatch) PatchType() string {
	return "application/merge-patch+json"
}

type ResumePatch struct {
	Resource Resource
}

func (s ResumePatch) ResourceMeta() Resource {
	return s.Resource
}

func (s ResumePatch) PatchJSON() ([]byte, error) {
	patch := map[string]interface{}{
		"spec": map[string]interface{}{
			"suspend": false,
		},
	}
	return json.Marshal(patch)
}

func (s ResumePatch) PatchType() string {
	return "application/merge-patch+json"
}

type ReconcilePatch struct {
	Resource Resource
}

func (r ReconcilePatch) ResourceMeta() Resource {
	return r.Resource
}

func (r ReconcilePatch) PatchJSON() ([]byte, error) {
	ts := time.Now().Format(time.RFC3339Nano)

	logger := logging.Logger().WithFields(map[string]interface{}{
		"resource_kind":        r.Resource.Kind,
		"resource_name":        r.Resource.Name,
		"resource_namespace":   r.Resource.Namespace,
		"resource_uid":         r.Resource.UID,
		"timestamp":            ts,
		"reconcile_annotation": meta.ReconcileRequestAnnotation,
	})

	annotations := map[string]string{
		meta.ReconcileRequestAnnotation: ts,
	}

	if r.Resource.Kind == "HelmRelease" {
		logger = logger.WithField("force_annotation", helmv2.ForceRequestAnnotation)
		annotations[helmv2.ForceRequestAnnotation] = ts
	}

	patch := map[string]interface{}{
		"metadata": map[string]interface{}{
			"annotations": annotations,
		},
	}

	patchBytes, err := json.Marshal(patch)
	if err != nil {
		logger.WithError(err).Error("Failed to marshal merge patch")
		return nil, err
	}

	logger.WithFields(map[string]interface{}{
		"annotations": annotations,
		"patch_json":  string(patchBytes),
	}).Debug("Created reconcile patch")

	return patchBytes, nil
}

func (s ReconcilePatch) PatchType() string {
	return "application/merge-patch+json"
}

func escapeJSONPointer(s string) string {
	s = strings.ReplaceAll(s, "~", "~0")
	s = strings.ReplaceAll(s, "/", "~1")
	return s
}
