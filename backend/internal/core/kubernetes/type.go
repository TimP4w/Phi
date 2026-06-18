package kubernetes

import (
	"errors"
	"maps"
	"reflect"
	"slices"
	"time"

	"k8s.io/apimachinery/pkg/types"
)

var ErrNotFound = errors.New("resource not found")

const (
	EventTTL             = 72 * time.Hour
	MaxEventsPerResource = 100
)

type Resource struct {
	Kind                   string                 `json:"kind"`
	Version                string                 `json:"version"`
	Namespace              string                 `json:"namespace"`
	Name                   string                 `json:"name"`
	Resource               string                 `json:"resource"`
	ParentIDs              []string               `json:"parentIDs"`
	ParentRefs             []string               `json:"parentRefs"`
	UID                    string                 `json:"uid"`
	Labels                 map[string]string      `json:"labels"`
	Annotations            map[string]string      `json:"annotations"`
	Group                  string                 `json:"group"`
	Status                 Status                 `json:"status"`
	Conditions             []Condition            `json:"conditions"`
	CreatedAt              time.Time              `json:"createdAt"`
	DeletedAt              *time.Time             `json:"deletedAt,omitempty"`
	IsFluxManaged          bool                   `json:"isFluxManaged"`
	FluxMetadata           FluxMetadata           `json:"fluxMetadata,omitempty"`
	PodMetadata            PodMetadata            `json:"podMetadata,omitempty"`
	DeploymentMetadata     DeploymentMetadata     `json:"deploymentMetadata,omitempty"`
	HelmReleaseMetadata    HelmReleaseMetadata    `json:"helmReleaseMetadata,omitempty"`
	KustomizationMetadata  KustomizationMetadata  `json:"kustomizationMetadata,omitempty"`
	PVCMetadata            PVCMetadata            `json:"pvcMetadata,omitempty"`
	PVMetadata             PVMetadata             `json:"pvMetadata,omitempty"`
	LonghornVolumeMetadata LonghornVolumeMetadata `json:"longhornVolumeMetadata,omitempty"`
	LonghornNodeMetadata   LonghornNodeMetadata   `json:"longhornNodeMetadata,omitempty"`
	NodeMetadata           NodeMetadata           `json:"nodeMetadata,omitempty"`
	GitRepositoryMetadata  GitRepositoryMetadata  `json:"gitRepositoryMetadata,omitempty"`
	OCIRepositoryMetadata  OCIRepositoryMetadata  `json:"ociRepositoryMetadata,omitempty"`
	ServiceMetadata        ServiceMetadata        `json:"serviceMetadata,omitempty"`
	RouteMetadata          RouteMetadata          `json:"routeMetadata,omitempty"`
	EndpointSliceMetadata  EndpointSliceMetadata  `json:"endpointSliceMetadata,omitempty"`
	GatewayMetadata        GatewayMetadata        `json:"gatewayMetadata,omitempty"`
	CertificateMetadata    CertificateMetadata    `json:"certificateMetadata,omitempty"`
	NetworkPolicyMetadata  NetworkPolicyMetadata  `json:"networkPolicyMetadata,omitempty"`
	ProxyMetadata          ProxyMetadata          `json:"proxyMetadata,omitempty"`
	TrivyMetadata          TrivyMetadata          `json:"trivyMetadata,omitempty"`
}

// Clone returns a deep copy of the Resource. Every value-typed field is copied
// by the struct assignment; the reference-typed fields (slices, maps, and the
// metadata structs that hold them) are cloned so the copy never shares backing
// storage with the original. TestClone guards that no reference field is missed.
func (e Resource) Clone() Resource {
	out := e
	out.ParentIDs = slices.Clone(e.ParentIDs)
	out.ParentRefs = slices.Clone(e.ParentRefs)
	out.Labels = maps.Clone(e.Labels)
	out.Annotations = maps.Clone(e.Annotations)
	out.Conditions = slices.Clone(e.Conditions)
	out.PodMetadata = e.PodMetadata.clone()
	out.DeploymentMetadata = e.DeploymentMetadata.clone()
	out.KustomizationMetadata = e.KustomizationMetadata.clone()
	out.PVCMetadata = e.PVCMetadata.clone()
	out.PVMetadata = e.PVMetadata.clone()
	out.ServiceMetadata = e.ServiceMetadata.clone()
	out.RouteMetadata = e.RouteMetadata.clone()
	out.EndpointSliceMetadata = e.EndpointSliceMetadata.clone()
	out.GatewayMetadata = e.GatewayMetadata.clone()
	out.CertificateMetadata = e.CertificateMetadata.clone()
	out.NetworkPolicyMetadata = e.NetworkPolicyMetadata.clone()
	out.ProxyMetadata = e.ProxyMetadata.clone()
	out.NodeMetadata = e.NodeMetadata.clone()
	return out
}

func (e *Resource) GetRef() string {
	return ResourceRef{
		Group:     e.Group,
		Version:   e.Version,
		Kind:      e.Kind,
		Namespace: e.Namespace,
		Name:      e.Name,
	}.String()
}

func (e *Resource) GetRefVersion() string {
	_, version := SplitAPIVersion(e.Version)
	return version
}

func (e *Resource) IsDeepEqual(other Resource) bool {
	return reflect.DeepEqual(*e, other)
}

// ServiceMetadata carries the networking-relevant fields of a core/v1 Service.
// ExternalIPs are sourced from status.loadBalancer.ingress (e.g. the address
// MetalLB assigns to a type=LoadBalancer Service).
type ServiceMetadata struct {
	Type        string            `json:"type,omitempty"`
	ClusterIPs  []string          `json:"clusterIPs,omitempty"`
	ExternalIPs []string          `json:"externalIPs,omitempty"`
	Selector    map[string]string `json:"selector,omitempty"`
	Ports       []ServicePort     `json:"ports,omitempty"`
}

type ServicePort struct {
	Name       string `json:"name,omitempty"`
	Protocol   string `json:"protocol,omitempty"`
	Port       int32  `json:"port"`
	TargetPort string `json:"targetPort,omitempty"`
	NodePort   int32  `json:"nodePort,omitempty"`
}

// clone returns a deep copy so a stored Resource never shares the underlying
// slices/map with the snapshot it was copied from.
func (s ServiceMetadata) clone() ServiceMetadata {
	out := ServiceMetadata{Type: s.Type}
	out.ClusterIPs = append([]string(nil), s.ClusterIPs...)
	out.ExternalIPs = append([]string(nil), s.ExternalIPs...)
	out.Ports = append([]ServicePort(nil), s.Ports...)
	if s.Selector != nil {
		out.Selector = make(map[string]string, len(s.Selector))
		maps.Copy(out.Selector, s.Selector)
	}
	return out
}

// RouteMetadata is the kind-agnostic representation of anything that routes
// external traffic to a backend: Ingress, Traefik IngressRoute, or a Gateway API
// *Route. Class is the ingressClassName / gatewayClassName. ParentRefs are the
// Gateways a Gateway API route attaches to (empty for plain Ingress).
type RouteMetadata struct {
	Class       string           `json:"class,omitempty"`
	Hostnames   []string         `json:"hostnames,omitempty"`
	BackendRefs []BackendRef     `json:"backendRefs,omitempty"`
	ParentRefs  []RouteParentRef `json:"routeParentRefs,omitempty"`
	// Addresses are the route's own external addresses (Ingress
	// status.loadBalancer.ingress). They match the external IP of the ingress
	// controller's LoadBalancer Service, letting the network view link a route
	// to its real entrypoint (e.g. Internet → Traefik LB → Ingress).
	Addresses []string `json:"addresses,omitempty"`
	// TLSSecretRefs are canonical "namespace/name" refs to the TLS secrets this
	// route terminates with (Ingress spec.tls, IngressRoute spec.tls.secretName).
	TLSSecretRefs []string `json:"tlsSecretRefs,omitempty"`
	// MiddlewareRefs are canonical "namespace/name" refs to Traefik Middlewares
	// applied to this route, in order (the "walls" traffic passes through).
	MiddlewareRefs []string `json:"middlewareRefs,omitempty"`
	// TLSEnabled is true when the route terminates TLS, even if it names no
	// secret (e.g. an Ingress with a tls block but no secretName, where the proxy
	// supplies a default/wildcard certificate).
	TLSEnabled bool `json:"tlsEnabled,omitempty"`
	// EntryPoints are the named Traefik entrypoints this route is exposed on
	// (e.g. web, websecure, websecure-ext), from the IngressRoute spec or the
	// traefik.ingress.kubernetes.io/router.entrypoints annotation on an Ingress.
	// They distinguish internal vs external exposure of otherwise identical routes.
	EntryPoints []string `json:"entryPoints,omitempty"`
}

// BackendRef points at a backend (almost always a Service) a route forwards to.
type BackendRef struct {
	Group     string `json:"group,omitempty"`
	Kind      string `json:"kind,omitempty"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	Port      int32  `json:"port,omitempty"`
}

// RouteParentRef points at a Gateway (Gateway API) a route attaches to.
type RouteParentRef struct {
	Group       string `json:"group,omitempty"`
	Kind        string `json:"kind,omitempty"`
	Name        string `json:"name"`
	Namespace   string `json:"namespace,omitempty"`
	SectionName string `json:"sectionName,omitempty"`
}

func (r RouteMetadata) clone() RouteMetadata {
	return RouteMetadata{
		Class:          r.Class,
		Hostnames:      append([]string(nil), r.Hostnames...),
		BackendRefs:    append([]BackendRef(nil), r.BackendRefs...),
		ParentRefs:     append([]RouteParentRef(nil), r.ParentRefs...),
		Addresses:      append([]string(nil), r.Addresses...),
		TLSSecretRefs:  append([]string(nil), r.TLSSecretRefs...),
		MiddlewareRefs: append([]string(nil), r.MiddlewareRefs...),
		EntryPoints:    append([]string(nil), r.EntryPoints...),
		TLSEnabled:     r.TLSEnabled,
	}
}

// EndpointSliceMetadata carries the Service→Pod backing of a
// discovery.k8s.io/v1 EndpointSlice. ServiceName is the Service this slice backs
// (same namespace), from the kubernetes.io/service-name label. Each endpoint
// targets a Pod, letting the network view connect a Service to its ready Pods.
type EndpointSliceMetadata struct {
	ServiceName string           `json:"serviceName,omitempty"`
	Endpoints   []EndpointTarget `json:"endpoints,omitempty"`
}

type EndpointTarget struct {
	TargetKind string `json:"targetKind,omitempty"`
	TargetName string `json:"targetName,omitempty"`
	TargetUID  string `json:"targetUID,omitempty"`
	Ready      bool   `json:"ready"`
}

func (e EndpointSliceMetadata) clone() EndpointSliceMetadata {
	return EndpointSliceMetadata{
		ServiceName: e.ServiceName,
		Endpoints:   append([]EndpointTarget(nil), e.Endpoints...),
	}
}

// GatewayMetadata carries the entrypoint-relevant fields of a Gateway API
// Gateway. GatewayClassName binds it to its GatewayClass; Addresses are the
// external addresses an implementation assigns (status.addresses).
type GatewayMetadata struct {
	GatewayClassName string            `json:"gatewayClassName,omitempty"`
	Addresses        []string          `json:"addresses,omitempty"`
	Listeners        []GatewayListener `json:"listeners,omitempty"`
	// TLSSecretRefs are canonical "namespace/name" refs to the certificate
	// secrets referenced by the gateway's listeners (tls.certificateRefs).
	TLSSecretRefs []string `json:"tlsSecretRefs,omitempty"`
}

type GatewayListener struct {
	Name     string `json:"name,omitempty"`
	Protocol string `json:"protocol,omitempty"`
	Hostname string `json:"hostname,omitempty"`
	Port     int32  `json:"port,omitempty"`
}

func (g GatewayMetadata) clone() GatewayMetadata {
	return GatewayMetadata{
		GatewayClassName: g.GatewayClassName,
		Addresses:        append([]string(nil), g.Addresses...),
		Listeners:        append([]GatewayListener(nil), g.Listeners...),
		TLSSecretRefs:    append([]string(nil), g.TLSSecretRefs...),
	}
}

// NetworkPolicyMetadata carries the selector and rule shape of a NetworkPolicy,
// so the network view can show which pods it gates and in which directions.
type NetworkPolicyMetadata struct {
	PodSelector  map[string]string `json:"podSelector,omitempty"`
	PolicyTypes  []string          `json:"policyTypes,omitempty"`
	IngressRules int               `json:"ingressRules,omitempty"`
	EgressRules  int               `json:"egressRules,omitempty"`
}

func (n NetworkPolicyMetadata) clone() NetworkPolicyMetadata {
	out := NetworkPolicyMetadata{
		PolicyTypes:  append([]string(nil), n.PolicyTypes...),
		IngressRules: n.IngressRules,
		EgressRules:  n.EgressRules,
	}
	if n.PodSelector != nil {
		out.PodSelector = make(map[string]string, len(n.PodSelector))
		maps.Copy(out.PodSelector, n.PodSelector)
	}
	return out
}

// ProxyMetadata carries ingress-controller ("proxy") configuration that has no
// first-class Kubernetes object — currently the middlewares/filters applied at
// each named entrypoint. Populated by controller-specific providers (e.g. the
// Traefik provider parses them from the proxy workload's args); left empty for
// controllers that have no such concept.
type ProxyMetadata struct {
	EntrypointMiddlewares map[string][]string `json:"entrypointMiddlewares,omitempty"`
}

func (p ProxyMetadata) clone() ProxyMetadata {
	if p.EntrypointMiddlewares == nil {
		return ProxyMetadata{}
	}
	out := make(map[string][]string, len(p.EntrypointMiddlewares))
	for k, v := range p.EntrypointMiddlewares {
		out[k] = append([]string(nil), v...)
	}
	return ProxyMetadata{EntrypointMiddlewares: out}
}

// CertificateMetadata carries the debugging-relevant status of a cert-manager
// Certificate: the secret it writes, whether it is Ready, when it expires, and
// its issuer.
type CertificateMetadata struct {
	SecretName string   `json:"secretName,omitempty"`
	Ready      bool     `json:"ready,omitempty"`
	NotAfter   string   `json:"notAfter,omitempty"`
	Issuer     string   `json:"issuer,omitempty"`
	DNSNames   []string `json:"dnsNames,omitempty"`
}

func (c CertificateMetadata) clone() CertificateMetadata {
	out := c
	out.DNSNames = append([]string(nil), c.DNSNames...)
	return out
}

var reconcilableKinds = map[string]struct{}{
	"Kustomization":  {},
	"HelmRelease":    {},
	"HelmRepository": {},
	"HelmChart":      {},
	"GitRepository":  {},
	"OCIRepository":  {},
	"Bucket":         {},
}

func (e *Resource) IsReconcilable() bool {
	_, ok := reconcilableKinds[e.Kind]
	return ok
}

func (e *Resource) IsSuspendable() bool {
	_, ok := reconcilableKinds[e.Kind]
	return ok
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
	LastHandledReconcileAt *time.Time `json:"lastHandledReconcileAt,omitempty"`
	LastSyncAt             *time.Time `json:"lastSyncAt,omitempty"`
	IsSuspended            bool       `json:"isSuspended,omitempty"`
	IsReconciling          bool       `json:"isReconciling,omitempty"`
}

type PodMetadata struct {
	Phase      string      `json:"phase"`
	Image      string      `json:"image"`
	Containers []Container `json:"containers,omitempty"`
}

// Container is the per-container status of a pod, covering both init and regular
// containers so the UI can show which container is failing and why.
type Container struct {
	Name         string `json:"name"`
	Image        string `json:"image"`
	Ready        bool   `json:"ready"`
	Started      bool   `json:"started"`
	RestartCount int32  `json:"restartCount"`
	State        string `json:"state"`            // Running, Waiting, Terminated
	Reason       string `json:"reason,omitempty"` // e.g. CrashLoopBackOff, PodInitializing
	Message      string `json:"message,omitempty"`
	ExitCode     int32  `json:"exitCode,omitempty"`
	IsInit       bool   `json:"isInit,omitempty"`
}

// clone returns a deep copy so a stored Resource never shares the underlying
// Containers slice with the snapshot it was copied from.
func (p PodMetadata) clone() PodMetadata {
	out := PodMetadata{Phase: p.Phase, Image: p.Image}
	out.Containers = append([]Container(nil), p.Containers...)
	return out
}

type HelmReleaseMetadata struct {
	ChartName    string    `json:"chartName,omitempty"`
	ChartVersion string    `json:"chartVersion,omitempty"`
	SourceRef    SourceRef `json:"sourceRef,omitempty"`
}

type KustomizationMetadata struct {
	Path                  string    `json:"path,omitempty"`
	SourceRef             SourceRef `json:"sourceRef,omitempty"`
	LastAppliedRevision   string    `json:"lastAppliedRevision,omitempty"`
	LastAttemptedRevision string    `json:"lastAttemptedRevision,omitempty"`
	DependsOn             []string  `json:"dependsOn,omitempty"`
}

func (k KustomizationMetadata) clone() KustomizationMetadata {
	out := k
	out.DependsOn = slices.Clone(k.DependsOn)
	return out
}

type DeploymentMetadata struct {
	Replicas          int32    `json:"replicas,omitempty"`
	ReadyReplicas     int32    `json:"readyReplicas,omitempty"`
	UpdatedReplicas   int32    `json:"updatedReplicas,omitempty"`
	AvailableReplicas int32    `json:"availableReplicas,omitempty"`
	Images            []string `json:"images,omitempty"`
}

func (d DeploymentMetadata) clone() DeploymentMetadata {
	out := d
	out.Images = slices.Clone(d.Images)
	return out
}

type PVCMetadata struct {
	StorageClass string            `json:"storageClass,omitempty"`
	VolumeName   string            `json:"volumeName,omitempty"`
	VolumeMode   string            `json:"volumeMode,omitempty"`
	AccessModes  []string          `json:"accessModes,omitempty"`
	Capacity     map[string]string `json:"capacity,omitempty"`
	Phase        string            `json:"phase,omitempty"`
	// Requested is spec.resources.requests.storage in bytes — the size the claim
	// asked for, as opposed to status.capacity (the size actually provisioned).
	Requested int64 `json:"requested,omitempty"`
}

func (p PVCMetadata) clone() PVCMetadata {
	out := p
	out.AccessModes = slices.Clone(p.AccessModes)
	out.Capacity = maps.Clone(p.Capacity)
	return out
}

// PVMetadata carries the provisioning-relevant fields of a core/v1
// PersistentVolume. Capacity is spec.capacity.storage in bytes (mirroring the
// Longhorn byte counts) so the frontend can sum it without parsing quantities.
// Driver is spec.csi.driver; NFSServer/NFSShare are populated by the csi
// provider only for nfs.csi.k8s.io volumes.
type PVMetadata struct {
	Capacity      int64    `json:"capacity,omitempty"`      // spec.capacity.storage, bytes
	StorageClass  string   `json:"storageClass,omitempty"`  // spec.storageClassName
	Driver        string   `json:"driver,omitempty"`        // spec.csi.driver
	AccessModes   []string `json:"accessModes,omitempty"`   // spec.accessModes
	ReclaimPolicy string   `json:"reclaimPolicy,omitempty"` // spec.persistentVolumeReclaimPolicy
	VolumeMode    string   `json:"volumeMode,omitempty"`    // spec.volumeMode
	Phase         string   `json:"phase,omitempty"`         // status.phase
	NFSServer     string   `json:"nfsServer,omitempty"`     // nfs.csi.k8s.io volumeAttributes.server
	NFSShare      string   `json:"nfsShare,omitempty"`      // nfs.csi.k8s.io volumeAttributes.share
}

func (p PVMetadata) clone() PVMetadata {
	out := p
	out.AccessModes = append([]string(nil), p.AccessModes...)
	return out
}

// LonghornNodeMetadata carries the aggregated disk capacity of a
// Node.longhorn.io object, summed across all of the node's disks. Byte counts
// mirror the Longhorn dashboard, where an enabled disk's capacity partitions
// into Reserved + Used + Schedulable: Used is the space scheduled to replicas
// (storageScheduled), Reserved the admin-reserved space, Schedulable the room
// left for new replicas, and Disabled the capacity of disks closed to
// scheduling. All fields are comparable so equality uses a plain struct
// comparison.
type LonghornNodeMetadata struct {
	Ready              bool  `json:"ready"`
	Schedulable        bool  `json:"schedulable"`
	StorageMaximum     int64 `json:"storageMaximum,omitempty"`     // total
	StorageUsed        int64 `json:"storageUsed,omitempty"`        // scheduled to replicas
	StorageReserved    int64 `json:"storageReserved,omitempty"`    // admin reserved
	StorageSchedulable int64 `json:"storageSchedulable,omitempty"` // max - reserved - scheduled
	StorageDisabled    int64 `json:"storageDisabled,omitempty"`    // capacity of unschedulable disks
}

// NodeMetadata carries the host-level facts of a core/v1 Node
type NodeMetadata struct {
	InternalIP       string   `json:"internalIP,omitempty"`       // status.addresses InternalIP
	OS               string   `json:"os,omitempty"`               // status.nodeInfo.operatingSystem
	Architecture     string   `json:"architecture,omitempty"`     // status.nodeInfo.architecture
	KernelVersion    string   `json:"kernelVersion,omitempty"`    // status.nodeInfo.kernelVersion
	OSImage          string   `json:"osImage,omitempty"`          // status.nodeInfo.osImage
	KubeletVersion   string   `json:"kubeletVersion,omitempty"`   // status.nodeInfo.kubeletVersion
	ContainerRuntime string   `json:"containerRuntime,omitempty"` // status.nodeInfo.containerRuntimeVersion
	Roles            []string `json:"roles,omitempty"`            // from node-role.kubernetes.io/* labels
	Unschedulable    bool     `json:"unschedulable,omitempty"`    // spec.unschedulable (cordoned)
}

func (n NodeMetadata) clone() NodeMetadata {
	out := n
	out.Roles = slices.Clone(n.Roles)
	return out
}

// LonghornVolumeMetadata carries the Longhorn-specific status of a
// Volume.longhorn.io object. Size and ActualSize are byte counts: Size is the
// provisioned (spec) capacity, ActualSize the space currently consumed on disk.
// All fields are comparable so equality uses a plain struct comparison.
type LonghornVolumeMetadata struct {
	State            string `json:"state,omitempty"`            // attached / detached
	Robustness       string `json:"robustness,omitempty"`       // healthy / degraded / faulted / unknown
	Size             int64  `json:"size,omitempty"`             // provisioned bytes
	ActualSize       int64  `json:"actualSize,omitempty"`       // bytes used on disk
	NumberOfReplicas int64  `json:"numberOfReplicas,omitempty"` // desired replica count
	NodeID           string `json:"nodeID,omitempty"`           // node the volume is attached to
	Frontend         string `json:"frontend,omitempty"`         // blockdev / iscsi
	AccessMode       string `json:"accessMode,omitempty"`       // rwo / rwx
}

// TrivyMetadata carries the summary of a single Trivy Operator report
// (aquasecurity.github.io). Only the small severity counts and the target
// workload reference are kept here — the full vulnerability/check arrays stay in
// the report object and are fetched on demand via the Trivy findings endpoint.
// ReportType is one of: vulnerability, configAudit, exposedSecret,
// rbacAssessment. For non-vulnerability reports the counts come from the same
// critical/high/medium/low summary the operator emits.
type TrivyMetadata struct {
	ReportType      string `json:"reportType,omitempty"`
	Critical        int    `json:"critical,omitempty"`
	High            int    `json:"high,omitempty"`
	Medium          int    `json:"medium,omitempty"`
	Low             int    `json:"low,omitempty"`
	Unknown         int    `json:"unknown,omitempty"`
	TargetKind      string `json:"targetKind,omitempty"`
	TargetName      string `json:"targetName,omitempty"`
	TargetNamespace string `json:"targetNamespace,omitempty"`
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
	StatusUnknown   Status = "unknown"
	StatusSuccess   Status = "success"
	StatusFailed    Status = "failed"
	StatusPending   Status = "pending"
	StatusWarning   Status = "warning"
	StatusSuspended Status = "suspended"
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
