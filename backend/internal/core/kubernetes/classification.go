package kubernetes

// GroupKind is a resource's type identity: its API group and kind, with the
// version deliberately excluded. It is the domain equivalent of
// k8s.io/apimachinery's schema.GroupKind, kept here so the core layer carries no
// dependency on apimachinery.
type GroupKind struct {
	Group string
	Kind  string
}

// FluxRole is "application" (reconciling workload), "repository" (source), or empty.
type FluxRole string

const (
	FluxRoleNone        FluxRole = ""
	FluxRoleApplication FluxRole = "application"
	FluxRoleRepository  FluxRole = "repository"
)

// TrivyReportType is a Trivy Operator report category, or empty for non-reports.
type TrivyReportType string

const (
	TrivyReportNone           TrivyReportType = ""
	TrivyReportVulnerability  TrivyReportType = "vulnerability"
	TrivyReportConfigAudit    TrivyReportType = "configAudit"
	TrivyReportExposedSecret  TrivyReportType = "exposedSecret"
	TrivyReportRbacAssessment TrivyReportType = "rbacAssessment"
)

// Classification holds the per-type facts the backend owns and the frontend consumes.
type Classification struct {
	Reconcilable    bool
	Suspendable     bool
	StaticSuccess   bool // config/identity object whose mere existence is "healthy"
	FluxRole        FluxRole
	TrivyReportType TrivyReportType
	HasMetrics      bool // workload that surfaces metrics chips/tabs
}

func gk(group, kind string) GroupKind { return GroupKind{Group: group, Kind: kind} }

// classifications maps each known GroupKind to its facts; absent keys yield the zero value.
var classifications = map[GroupKind]Classification{
	// Flux applications — reconcilable workloads.
	gk("kustomize.toolkit.fluxcd.io", "Kustomization"): {Reconcilable: true, Suspendable: true, FluxRole: FluxRoleApplication, HasMetrics: true},
	gk("helm.toolkit.fluxcd.io", "HelmRelease"):        {Reconcilable: true, Suspendable: true, FluxRole: FluxRoleApplication, HasMetrics: true},
	gk("source.toolkit.fluxcd.io", "HelmChart"):        {Reconcilable: true, Suspendable: true, FluxRole: FluxRoleApplication},

	// Flux repositories — sources.
	gk("source.toolkit.fluxcd.io", "HelmRepository"): {Reconcilable: true, Suspendable: true, FluxRole: FluxRoleRepository},
	gk("source.toolkit.fluxcd.io", "GitRepository"):  {Reconcilable: true, Suspendable: true, FluxRole: FluxRoleRepository},
	gk("source.toolkit.fluxcd.io", "OCIRepository"):  {Reconcilable: true, Suspendable: true, FluxRole: FluxRoleRepository},
	gk("source.toolkit.fluxcd.io", "Bucket"):         {Reconcilable: true, Suspendable: true, FluxRole: FluxRoleRepository},

	// Metrics-eligible core/apps workloads.
	gk("", "Pod"):             {HasMetrics: true},
	gk("apps", "Deployment"):  {HasMetrics: true},
	gk("apps", "StatefulSet"): {HasMetrics: true},
	gk("apps", "DaemonSet"):   {HasMetrics: true},

	// Trivy Operator reports.
	gk("aquasecurity.github.io", "VulnerabilityReport"):  {TrivyReportType: TrivyReportVulnerability},
	gk("aquasecurity.github.io", "ConfigAuditReport"):    {TrivyReportType: TrivyReportConfigAudit},
	gk("aquasecurity.github.io", "ExposedSecretReport"):  {TrivyReportType: TrivyReportExposedSecret},
	gk("aquasecurity.github.io", "RbacAssessmentReport"): {TrivyReportType: TrivyReportRbacAssessment},

	// Static-success config/identity objects: no runtime health, existence == healthy.
	gk("", "ConfigMap"):                                                  {StaticSuccess: true},
	gk("", "Secret"):                                                     {StaticSuccess: true},
	gk("", "ServiceAccount"):                                             {StaticSuccess: true},
	gk("rbac.authorization.k8s.io", "ClusterRole"):                       {StaticSuccess: true},
	gk("rbac.authorization.k8s.io", "ClusterRoleBinding"):                {StaticSuccess: true},
	gk("rbac.authorization.k8s.io", "Role"):                              {StaticSuccess: true},
	gk("rbac.authorization.k8s.io", "RoleBinding"):                       {StaticSuccess: true},
	gk("apiextensions.k8s.io", "CustomResourceDefinition"):               {StaticSuccess: true},
	gk("apps", "ControllerRevision"):                                     {StaticSuccess: true},
	gk("scheduling.k8s.io", "PriorityClass"):                             {StaticSuccess: true},
	gk("node.k8s.io", "RuntimeClass"):                                    {StaticSuccess: true},
	gk("storage.k8s.io", "StorageClass"):                                 {StaticSuccess: true},
	gk("storage.k8s.io", "CSIDriver"):                                    {StaticSuccess: true},
	gk("networking.k8s.io", "IngressClass"):                              {StaticSuccess: true},
	gk("coordination.k8s.io", "Lease"):                                   {StaticSuccess: true},
	gk("admissionregistration.k8s.io", "ValidatingWebhookConfiguration"): {StaticSuccess: true},
	gk("admissionregistration.k8s.io", "MutatingWebhookConfiguration"):   {StaticSuccess: true},
}

// GroupKind is the resource's type identity (group + kind; version excluded).
func (e *Resource) GroupKind() GroupKind {
	return GroupKind{Group: e.Group, Kind: e.Kind}
}

// ClassificationFor returns the facts for a GroupKind, or the zero value if unknown.
func ClassificationFor(groupKind GroupKind) Classification {
	return classifications[groupKind]
}

func (e *Resource) classification() Classification { return ClassificationFor(e.GroupKind()) }

func (e *Resource) IsReconcilable() bool  { return e.classification().Reconcilable }
func (e *Resource) IsSuspendable() bool   { return e.classification().Suspendable }
func (e *Resource) FluxRole() FluxRole    { return e.classification().FluxRole }
func (e *Resource) HasMetrics() bool      { return e.classification().HasMetrics }
func (e *Resource) IsStaticSuccess() bool { return e.classification().StaticSuccess }
