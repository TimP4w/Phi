package kubernetes

import (
	"maps"
	"strings"
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/types"
)

type Resource struct {
	Kind                  string                `json:"kind"`
	Version               string                `json:"version"`
	Namespace             string                `json:"namespace"`
	Name                  string                `json:"name"`
	Resource              string                `json:"resource"`
	ParentIDs             []string              `json:"parentIDs"`
	ParentRefs            []string              `json:"parentRefs"`
	UID                   string                `json:"uid"`
	Labels                map[string]string     `json:"labels"`
	Annotations           map[string]string     `json:"annotations"`
	Group                 string                `json:"group"`
	Status                Status                `json:"status"`
	Conditions            []Condition           `json:"conditions"`
	Events                []Event               `json:"events"`
	Children              []Resource            `json:"children"`
	CreatedAt             time.Time             `json:"createdAt"`
	DeletedAt             time.Time             `json:"deletedAt"`
	IsFluxManaged         bool                  `json:"isFluxManaged"`
	FluxMetadata          FluxMetadata          `json:"fluxMetadata,omitempty"`
	PodMetadata           PodMetadata           `json:"podMetadata,omitempty"`
	DeploymentMetadata    DeploymentMetadata    `json:"deploymentMetadata,omitempty"`
	HelmReleaseMetadata   HelmReleaseMetadata   `json:"helmReleaseMetadata,omitempty"`
	KustomizationMetadata KustomizationMetadata `json:"kustomizationMetadata,omitempty"`
	PVCMetadata           PVCMetadata           `json:"pvcMetadata,omitempty"`
	GitRepositoryMetadata GitRepositoryMetadata `json:"gitRepositoryMetadata,omitempty"`
	OCIRepositoryMetadata OCIRepositoryMetadata `json:"ociRepositoryMetadata,omitempty"`
}

// Copy copies all fields from another Resource into the receiver
func (e *Resource) Copy(other Resource) {
	e.UID = other.UID
	e.Kind = other.Kind
	e.Version = other.Version
	e.Namespace = other.Namespace
	e.Name = other.Name
	e.Resource = other.Resource

	e.ParentIDs = append(e.ParentIDs, other.ParentIDs...)
	e.ParentRefs = append(e.ParentRefs, other.ParentRefs...)

	if other.Labels != nil {
		e.Labels = make(map[string]string, len(other.Labels))
		for k, v := range other.Labels {
			e.Labels[k] = v
		}
	} else {
		e.Labels = nil
	}
	if other.Annotations != nil {
		e.Annotations = make(map[string]string, len(other.Annotations))
		for k, v := range other.Annotations {
			e.Annotations[k] = v
		}
	} else {
		e.Annotations = nil
	}

	e.Group = other.Group
	e.Status = other.Status
	e.Conditions = append([]Condition(nil), other.Conditions...)

	// Merge Events without duplicates (by UID) and with TTL cleanup
	e.Events = e.mergeEventsWithCleanup(other.Events)
	e.Children = append([]Resource(nil), other.Children...)
	e.CreatedAt = other.CreatedAt
	e.DeletedAt = other.DeletedAt
	e.IsFluxManaged = other.IsFluxManaged
	e.FluxMetadata = other.FluxMetadata
	e.PodMetadata = other.PodMetadata
	e.DeploymentMetadata = other.DeploymentMetadata
	e.HelmReleaseMetadata = other.HelmReleaseMetadata
	e.KustomizationMetadata = other.KustomizationMetadata
	e.PVCMetadata = other.PVCMetadata
	e.GitRepositoryMetadata = other.GitRepositoryMetadata
	e.OCIRepositoryMetadata = other.OCIRepositoryMetadata
}

// mergeEventsWithCleanup merges events from another resource with TTL and size limits
// First it filter existing events by TTL, then adds new events if they're not duplicates
// Finally, it limits the number of events
func (e *Resource) mergeEventsWithCleanup(otherEvents []Event) []Event {
	const eventTTL = 72 * time.Hour  // TODO: make configurable
	const maxEventsPerResource = 100 // TODO: make configurable

	existingUIDs := make(map[string]struct{}, len(e.Events))
	var validEvents []Event

	cutoffTime := time.Now().Add(-eventTTL)
	for _, ev := range e.Events {
		if ev.LastObserved.After(cutoffTime) {
			validEvents = append(validEvents, ev)
			existingUIDs[string(ev.UID)] = struct{}{}
		}
	}

	for _, ev := range otherEvents {
		if ev.LastObserved.After(cutoffTime) {
			if _, found := existingUIDs[string(ev.UID)]; !found {
				validEvents = append(validEvents, ev)
				existingUIDs[string(ev.UID)] = struct{}{}
			}
		}
	}

	if len(validEvents) > maxEventsPerResource {
		validEvents = e.sortAndLimitEvents(validEvents, maxEventsPerResource)
	}

	return validEvents
}

// sortAndLimitEvents sorts events by LastObserved time and keeps the most recent ones
func (e *Resource) sortAndLimitEvents(events []Event, maxEvents int) []Event {
	for i := 0; i < len(events)-1; i++ {
		for j := i + 1; j < len(events); j++ {
			if events[i].LastObserved.Before(events[j].LastObserved) {
				events[i], events[j] = events[j], events[i]
			}
		}
	}
	return events[:maxEvents]
}

func (e *Resource) GetRef() string {
	group := e.Group
	if group == "" {
		group = "core"
	}
	return group + "/" + e.GetRefVersion() + "/" + e.Kind + ":" + e.Namespace + "/" + e.Name
}

func (e *Resource) GetRefVersion() string {
	versionParts := strings.Split(e.Version, "/")
	if len(versionParts) > 1 {
		return versionParts[1]
	}
	return e.Version
}

func (e *Resource) IsDeepEqual(other Resource) bool {
	if e.UID != other.UID ||
		e.Kind != other.Kind ||
		e.Version != other.Version ||
		e.Namespace != other.Namespace ||
		e.Name != other.Name ||
		e.Resource != other.Resource ||
		e.Group != other.Group ||
		e.Status != other.Status ||
		e.CreatedAt != other.CreatedAt ||
		e.DeletedAt != other.DeletedAt ||
		e.IsFluxManaged != other.IsFluxManaged ||
		e.FluxMetadata != other.FluxMetadata ||
		e.PodMetadata != other.PodMetadata ||
		!deploymentMetadataEqual(e.DeploymentMetadata, other.DeploymentMetadata) ||
		e.HelmReleaseMetadata != other.HelmReleaseMetadata ||
		!kustomizationMetadataEqual(e.KustomizationMetadata, other.KustomizationMetadata) ||
		!pvcMetadataEqual(e.PVCMetadata, other.PVCMetadata) ||
		e.GitRepositoryMetadata != other.GitRepositoryMetadata ||
		e.OCIRepositoryMetadata != other.OCIRepositoryMetadata {
		return false
	}

	if len(e.ParentIDs) != len(other.ParentIDs) {
		return false
	}
	for i := range e.ParentIDs {
		if e.ParentIDs[i] != other.ParentIDs[i] {
			return false
		}
	}

	if len(e.ParentRefs) != len(other.ParentRefs) {
		return false
	}
	for i := range e.ParentRefs {
		if e.ParentRefs[i] != other.ParentRefs[i] {
			return false
		}
	}

	if maps.Equal(e.Labels, other.Labels) == false {
		return false
	}

	if maps.Equal(e.Annotations, other.Annotations) == false {
		return false
	}

	if len(e.Conditions) != len(other.Conditions) {
		return false
	}
	for i := range e.Conditions {
		if e.Conditions[i] != other.Conditions[i] {
			return false
		}
	}

	if len(e.Events) != len(other.Events) {
		return false
	}
	for i := range e.Events {
		if e.Events[i] != other.Events[i] {
			return false
		}
	}

	if len(e.Children) != len(other.Children) {
		return false
	}
	/*for i := range e.Children {
		if !e.Children[i].DeepEqual(other.Children[i]) {
			return false
		}
	}*/

	return true
}

// deploymentMetadataEqual compares two DeploymentMetadata structs for equality.
func deploymentMetadataEqual(a, b DeploymentMetadata) bool {
	if a.Replicas != b.Replicas ||
		a.ReadyReplicas != b.ReadyReplicas ||
		a.UpdatedReplicas != b.UpdatedReplicas ||
		a.AvailableReplicas != b.AvailableReplicas {
		return false
	}
	if len(a.Images) != len(b.Images) {
		return false
	}
	for i := range a.Images {
		if a.Images[i] != b.Images[i] {
			return false
		}
	}
	return true
}

// kustomizationMetadataEqual compares two KustomizationMetadata structs for equality.
func kustomizationMetadataEqual(a, b KustomizationMetadata) bool {
	if a.Path != b.Path ||
		a.IsReconciling != b.IsReconciling ||
		a.IsSuspended != b.IsSuspended ||
		a.SourceRef != b.SourceRef ||
		a.LastAppliedRevision != b.LastAppliedRevision ||
		a.LastAttemptedRevision != b.LastAttemptedRevision ||
		!a.LastHandledReconcileAt.Equal(b.LastHandledReconcileAt) {
		return false
	}
	if len(a.DependsOn) != len(b.DependsOn) {
		return false
	}
	for i := range a.DependsOn {
		if a.DependsOn[i] != b.DependsOn[i] {
			return false
		}
	}
	return true
}

// pvcMetadataEqual compares two PVCMetadata structs for equality.
func pvcMetadataEqual(a, b PVCMetadata) bool {
	if a.StorageClass != b.StorageClass ||
		a.VolumeName != b.VolumeName ||
		a.VolumeMode != b.VolumeMode ||
		a.Phase != b.Phase {
		return false
	}
	if len(a.AccessModes) != len(b.AccessModes) {
		return false
	}
	for i := range a.AccessModes {
		if a.AccessModes[i] != b.AccessModes[i] {
			return false
		}
	}
	if len(a.Capacity) != len(b.Capacity) {
		return false
	}
	for k, v := range a.Capacity {
		if bv, ok := b.Capacity[k]; !ok || bv != v {
			return false
		}
	}
	return true
}

func (e *Resource) IsReconcilable() bool {
	return e.Kind == "Kustomization" || e.Kind == "HelmRelease" || e.Kind == "HelmRepository" || e.Kind == "HelmChart" || e.Kind == "GitRepository" || e.Kind == "OCIRepository" || e.Kind == "Bucket"
}

func (e *Resource) IsSuspendable() bool {
	return e.Kind == "Kustomization" || e.Kind == "HelmRelease" || e.Kind == "HelmRepository" || e.Kind == "HelmChart" || e.Kind == "GitRepository" || e.Kind == "OCIRepository" || e.Kind == "Bucket"
}

type Event struct {
	UID           types.UID `json:"uid"`
	Kind          string    `json:"kind"`
	Name          string    `json:"name"`
	Namespace     string    `json:"namespace"`
	Reason        string    `json:"reason"`
	Message       string    `json:"message"`
	Source        string    `json:"source"`
	Type          string    `json:"type"`
	FirstObserved time.Time `json:"firstObserved"`
	LastObserved  time.Time `json:"lastObserved"`
	Count         int32     `json:"count"`
	ResourceUID   string    `json:"resourceUID"`
}

type FluxMetadata struct {
	LastHandledReconcileAt time.Time `json:"lastHandledReconcileAt,omitempty"`
	LastSyncAt             time.Time `json:"lastSyncAt,omitempty"`
	IsSuspended            bool      `json:"isSuspended,omitempty"`
	IsReconciling          bool      `json:"isReconciling,omitempty"`
}

type PodMetadata struct {
	Phase string `json:"phase"`
	Image string `json:"image"`
}

type HelmReleaseMetadata struct {
	ChartName     string    `json:"chartName,omitempty"`
	ChartVersion  string    `json:"chartVersion,omitempty"`
	IsReconciling bool      `json:"isReconciling,omitempty"`
	IsSuspended   bool      `json:"isSuspended,omitempty"`
	SourceRef     SourceRef `json:"sourceRef,omitempty"`
}

type KustomizationMetadata struct {
	Path                   string    `json:"path,omitempty"`
	IsReconciling          bool      `json:"isReconciling,omitempty"`
	IsSuspended            bool      `json:"isSuspended,omitempty"`
	SourceRef              SourceRef `json:"sourceRef,omitempty"`
	LastAppliedRevision    string    `json:"lastAppliedRevision,omitempty"`
	LastAttemptedRevision  string    `json:"lastAttemptedRevision,omitempty"`
	LastHandledReconcileAt time.Time `json:"lastHandledReconcileAt,omitempty"`
	DependsOn              []string  `json:"dependsOn,omitempty"`
}

type DeploymentMetadata struct {
	Replicas          int32    `json:"replicas,omitempty"`
	ReadyReplicas     int32    `json:"readyReplicas,omitempty"`
	UpdatedReplicas   int32    `json:"updatedReplicas,omitempty"`
	AvailableReplicas int32    `json:"availableReplicas,omitempty"`
	Images            []string `json:"images,omitempty"`
}

type PVCMetadata struct {
	StorageClass string            `json:"storageClass,omitempty"`
	VolumeName   string            `json:"volumeName,omitempty"`
	VolumeMode   string            `json:"volumeMode,omitempty"`
	AccessModes  []string          `json:"accessModes,omitempty"`
	Capacity     map[string]string `json:"capacity,omitempty"`
	Phase        string            `json:"phase,omitempty"`
}

type GitRepositoryMetadata struct {
	URL    string `json:"url,omitempty"`
	Branch string `json:"branch,omitempty"`
	Tag    string `json:"tag,omitempty"`
	Semver string `json:"semver,omitempty"`
	Name   string `json:"name,omitempty"`
	Commit string `json:"commit,omitempty"`
}

type OCIRepositoryMetadata struct {
	URL          string `json:"url,omitempty"`
	Digest       string `json:"digest,omitempty"`
	Tag          string `json:"tag,omitempty"`
	Semver       string `json:"semver,omitempty"`
	SemverFilter string `json:"semverFilter,omitempty"`
}

type SourceRef struct {
	Name      string `json:"name,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	Kind      string `json:"kind,omitempty"`
}

type Status string

const (
	StatusUnknown Status = "unknown"
	StatusSuccess Status = "success"
	StatusFailed  Status = "failed"
	StatusPending Status = "pending"
	StatusWarning Status = "warning"
)

const (
	KustomizationNameLabel      string = "kustomize.toolkit.fluxcd.io/name"
	KustomizationNamespaceLabel string = "kustomize.toolkit.fluxcd.io/namespace"
	HelmNameLabel               string = "helm.toolkit.fluxcd.io/name"
	HelmNamespaceLabel          string = "helm.toolkit.fluxcd.io/namespace"
)

type Condition struct {
	LastTransitionTime time.Time `json:"lastTransitionTime"`
	Message            string    `json:"message"`
	Reason             string    `json:"reason"`
	Status             string    `json:"status"`
	Type               string    `json:"type"`
}

type KubeLog struct {
	Timestamp time.Time `json:"timestamp"`
	Message   string    `json:"message"`
	Container string    `json:"container"`
}

/*
Copyright 2024 ahmetb

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
Original version: https://github.com/ahmetb/kubectl-tree/blob/8c32ac5fddbb59972a0d42e10f34500592fbacb5/cmd/kubectl-tree/apis.go
*/

type ApiResource struct {
	SingularName string
	Kind         string
	Name         string
	ShortNames   []string
	Group        string
	Version      string
}

type ResourceMap struct {
	List []ApiResource
	M    sync.Map // sync.Map for concurrent writes
}

func (rm *ResourceMap) Lookup(s string) []ApiResource {
	v, ok := rm.M.Load(strings.ToLower(s))
	if !ok {
		return nil
	}
	return v.([]ApiResource)
}

func (rm *ResourceMap) Resources() []ApiResource { return rm.List }
