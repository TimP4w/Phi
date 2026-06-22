package kubernetes

import (
	"encoding/json"
	"errors"
	"maps"
	"reflect"
	"slices"
	"time"
)

var ErrNotFound = errors.New("resource not found")

const (
	EventTTL             = 72 * time.Hour
	MaxEventsPerResource = 100
)

type Resource struct {
	Kind                   string                  `json:"kind"`
	Version                string                  `json:"version"`
	Namespace              string                  `json:"namespace"`
	Name                   string                  `json:"name"`
	Resource               string                  `json:"resource"`
	ParentIDs              []string                `json:"parentIDs"`
	ParentRefs             []string                `json:"parentRefs"`
	UID                    string                  `json:"uid"`
	Labels                 map[string]string       `json:"labels"`
	Annotations            map[string]string       `json:"annotations"`
	Group                  string                  `json:"group"`
	Status                 Status                  `json:"status"`
	Conditions             []Condition             `json:"conditions"`
	CreatedAt              time.Time               `json:"createdAt"`
	DeletedAt              *time.Time              `json:"deletedAt,omitempty"`
	IsFluxManaged          bool                    `json:"isFluxManaged"`
	FluxMetadata           FluxMetadata            `json:"fluxMetadata,omitempty"`
	PodMetadata            *PodMetadata            `json:"podMetadata,omitempty"`
	DeploymentMetadata     *DeploymentMetadata     `json:"deploymentMetadata,omitempty"`
	HelmReleaseMetadata    *HelmReleaseMetadata    `json:"helmReleaseMetadata,omitempty"`
	KustomizationMetadata  *KustomizationMetadata  `json:"kustomizationMetadata,omitempty"`
	PVCMetadata            *PVCMetadata            `json:"pvcMetadata,omitempty"`
	PVMetadata             *PVMetadata             `json:"pvMetadata,omitempty"`
	LonghornVolumeMetadata *LonghornVolumeMetadata `json:"longhornVolumeMetadata,omitempty"`
	LonghornNodeMetadata   *LonghornNodeMetadata   `json:"longhornNodeMetadata,omitempty"`
	NodeMetadata           *NodeMetadata           `json:"nodeMetadata,omitempty"`
	GitRepositoryMetadata  *GitRepositoryMetadata  `json:"gitRepositoryMetadata,omitempty"`
	OCIRepositoryMetadata  *OCIRepositoryMetadata  `json:"ociRepositoryMetadata,omitempty"`
	ServiceMetadata        *ServiceMetadata        `json:"serviceMetadata,omitempty"`
	RouteMetadata          *RouteMetadata          `json:"routeMetadata,omitempty"`
	EndpointSliceMetadata  *EndpointSliceMetadata  `json:"endpointSliceMetadata,omitempty"`
	GatewayMetadata        *GatewayMetadata        `json:"gatewayMetadata,omitempty"`
	CertificateMetadata    *CertificateMetadata    `json:"certificateMetadata,omitempty"`
	NetworkPolicyMetadata  *NetworkPolicyMetadata  `json:"networkPolicyMetadata,omitempty"`
	ProxyMetadata          *ProxyMetadata          `json:"proxyMetadata,omitempty"`
	TrivyMetadata          *TrivyMetadata          `json:"trivyMetadata,omitempty"`
}

// clonePtrDeep deep-copies *p via the type's clone(), or returns nil.
func clonePtrDeep[T any](p *T, deep func(T) T) *T {
	if p == nil {
		return nil
	}
	c := deep(*p)
	return &c
}

// clonePtr shallow-copies *p (enough for flat structs), or returns nil.
func clonePtr[T any](p *T) *T {
	if p == nil {
		return nil
	}
	c := *p
	return &c
}

// Clone returns a deep copy that shares no backing storage with the original.
func (e Resource) Clone() Resource {
	out := e
	out.ParentIDs = slices.Clone(e.ParentIDs)
	out.ParentRefs = slices.Clone(e.ParentRefs)
	out.Labels = maps.Clone(e.Labels)
	out.Annotations = maps.Clone(e.Annotations)
	out.Conditions = slices.Clone(e.Conditions)

	// Metadata with nested slices/maps deep-copy via clone(); flat ones shallow-copy.
	out.PodMetadata = clonePtrDeep(e.PodMetadata, PodMetadata.clone)
	out.DeploymentMetadata = clonePtrDeep(e.DeploymentMetadata, DeploymentMetadata.clone)
	out.KustomizationMetadata = clonePtrDeep(e.KustomizationMetadata, KustomizationMetadata.clone)
	out.PVCMetadata = clonePtrDeep(e.PVCMetadata, PVCMetadata.clone)
	out.PVMetadata = clonePtrDeep(e.PVMetadata, PVMetadata.clone)
	out.ServiceMetadata = clonePtrDeep(e.ServiceMetadata, ServiceMetadata.clone)
	out.RouteMetadata = clonePtrDeep(e.RouteMetadata, RouteMetadata.clone)
	out.EndpointSliceMetadata = clonePtrDeep(e.EndpointSliceMetadata, EndpointSliceMetadata.clone)
	out.GatewayMetadata = clonePtrDeep(e.GatewayMetadata, GatewayMetadata.clone)
	out.CertificateMetadata = clonePtrDeep(e.CertificateMetadata, CertificateMetadata.clone)
	out.NetworkPolicyMetadata = clonePtrDeep(e.NetworkPolicyMetadata, NetworkPolicyMetadata.clone)
	out.ProxyMetadata = clonePtrDeep(e.ProxyMetadata, ProxyMetadata.clone)
	out.NodeMetadata = clonePtrDeep(e.NodeMetadata, NodeMetadata.clone)

	out.HelmReleaseMetadata = clonePtr(e.HelmReleaseMetadata)
	out.GitRepositoryMetadata = clonePtr(e.GitRepositoryMetadata)
	out.OCIRepositoryMetadata = clonePtr(e.OCIRepositoryMetadata)
	out.LonghornVolumeMetadata = clonePtr(e.LonghornVolumeMetadata)
	out.LonghornNodeMetadata = clonePtr(e.LonghornNodeMetadata)
	out.TrivyMetadata = clonePtr(e.TrivyMetadata)
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

// MarshalJSON adds the registry-computed classification facts; alias strips methods to avoid recursion.
func (e Resource) MarshalJSON() ([]byte, error) {
	type alias Resource
	return json.Marshal(struct {
		alias
		IsReconcilable bool     `json:"isReconcilable"`
		FluxRole       FluxRole `json:"fluxRole,omitempty"`
		HasMetrics     bool     `json:"hasMetrics"`
	}{
		alias:          alias(e),
		IsReconcilable: e.IsReconcilable(),
		FluxRole:       e.FluxRole(),
		HasMetrics:     e.HasMetrics(),
	})
}

func (e *Resource) IsDeepEqual(other Resource) bool {
	return reflect.DeepEqual(*e, other)
}

// ServiceMetadata carries the networking-relevant fields of a core/v1 Service.
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

// clone returns a deep copy so a stored Resource never shares backing storage.
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

// RouteMetadata is the kind-agnostic representation of anything that routes external traffic to a backend (Ingress, Traefik IngressRoute, or a Gateway API *Route).
type RouteMetadata struct {
	Class       string           `json:"class,omitempty"`
	Hostnames   []string         `json:"hostnames,omitempty"`
	BackendRefs []BackendRef     `json:"backendRefs,omitempty"`
	ParentRefs  []RouteParentRef `json:"routeParentRefs,omitempty"`
	// Route's own external addresses; match the ingress controller's LoadBalancer Service.
	Addresses []string `json:"addresses,omitempty"`
	// Canonical "namespace/name" refs to the TLS secrets this route terminates with.
	TLSSecretRefs []string `json:"tlsSecretRefs,omitempty"`
	// Canonical "namespace/name" refs to the Traefik Middlewares applied, in order.
	MiddlewareRefs []string `json:"middlewareRefs,omitempty"`
	// True when the route terminates TLS, even if it names no secret (default/wildcard cert).
	TLSEnabled bool `json:"tlsEnabled,omitempty"`
	// Named Traefik entrypoints the route is exposed on; distinguish internal vs external.
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

// EndpointSliceMetadata carries the Service→Pod backing of a discovery.k8s.io/v1 EndpointSlice.
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

// GatewayMetadata carries the entrypoint-relevant fields of a Gateway API Gateway.
type GatewayMetadata struct {
	GatewayClassName string            `json:"gatewayClassName,omitempty"`
	Addresses        []string          `json:"addresses,omitempty"`
	Listeners        []GatewayListener `json:"listeners,omitempty"`
	// Canonical "namespace/name" refs to the certificate secrets the listeners reference.
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

// NetworkPolicyPort is a single port (or port range) a NetworkPolicy rule allows.
type NetworkPolicyPort struct {
	Protocol string `json:"protocol,omitempty"`
	Port     string `json:"port,omitempty"`    // numeric or named
	EndPort  int32  `json:"endPort,omitempty"` // range upper bound, if set
}

// NetworkPolicyPeer is one allowed peer of a NetworkPolicy rule (one shape set).
type NetworkPolicyPeer struct {
	PodSelector       map[string]string `json:"podSelector,omitempty"`
	NamespaceSelector map[string]string `json:"namespaceSelector,omitempty"`
	IPBlock           string            `json:"ipBlock,omitempty"` // CIDR
}

// NetworkPolicyRule is one ingress or egress rule; empty Peers means "anywhere", empty Ports "all ports".
type NetworkPolicyRule struct {
	Peers []NetworkPolicyPeer `json:"peers,omitempty"`
	Ports []NetworkPolicyPort `json:"ports,omitempty"`
}

func (r NetworkPolicyRule) clone() NetworkPolicyRule {
	out := NetworkPolicyRule{
		Ports: append([]NetworkPolicyPort(nil), r.Ports...),
	}
	if r.Peers != nil {
		out.Peers = make([]NetworkPolicyPeer, len(r.Peers))
		for i, p := range r.Peers {
			cp := NetworkPolicyPeer{IPBlock: p.IPBlock}
			if p.PodSelector != nil {
				cp.PodSelector = make(map[string]string, len(p.PodSelector))
				maps.Copy(cp.PodSelector, p.PodSelector)
			}
			if p.NamespaceSelector != nil {
				cp.NamespaceSelector = make(map[string]string, len(p.NamespaceSelector))
				maps.Copy(cp.NamespaceSelector, p.NamespaceSelector)
			}
			out.Peers[i] = cp
		}
	}
	return out
}

// NetworkPolicyMetadata carries the selector and rule shape of a NetworkPolicy, so the network view can show which pods it gates and in which directions.
type NetworkPolicyMetadata struct {
	PodSelector  map[string]string   `json:"podSelector,omitempty"`
	PolicyTypes  []string            `json:"policyTypes,omitempty"`
	IngressRules int                 `json:"ingressRules,omitempty"`
	EgressRules  int                 `json:"egressRules,omitempty"`
	Ingress      []NetworkPolicyRule `json:"ingress,omitempty"`
	Egress       []NetworkPolicyRule `json:"egress,omitempty"`
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
	if n.Ingress != nil {
		out.Ingress = make([]NetworkPolicyRule, len(n.Ingress))
		for i, r := range n.Ingress {
			out.Ingress[i] = r.clone()
		}
	}
	if n.Egress != nil {
		out.Egress = make([]NetworkPolicyRule, len(n.Egress))
		for i, r := range n.Egress {
			out.Egress[i] = r.clone()
		}
	}
	return out
}

// ProxyMetadata carries ingress-controller config with no first-class object: the middlewares per entrypoint.
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

// CertificateMetadata carries the debugging-relevant status of a cert-manager Certificate.
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

type Event struct {
	UID           string    `json:"uid"`
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

// Container is the per-container status of a pod (init and regular).
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

// clone returns a deep copy so a stored Resource never shares backing storage.
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
	Requested    int64             `json:"requested,omitempty"` // spec.resources.requests.storage, bytes
}

func (p PVCMetadata) clone() PVCMetadata {
	out := p
	out.AccessModes = slices.Clone(p.AccessModes)
	out.Capacity = maps.Clone(p.Capacity)
	return out
}

// PVMetadata carries the provisioning-relevant fields of a core/v1 PersistentVolume.
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

// LonghornNodeMetadata carries the aggregated disk capacity of a Node.longhorn.io object.
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

// LonghornVolumeMetadata carries the Longhorn-specific status of a Volume.longhorn.io object.
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

// TrivyMetadata carries the severity-count summary of a single Trivy Operator report.
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
