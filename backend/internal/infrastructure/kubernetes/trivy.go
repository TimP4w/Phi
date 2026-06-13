package kubernetes

import (
	kube "github.com/timp4w/phi/internal/core/kubernetes"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// This file is the Trivy provider: all Trivy Operator (aquasecurity.github.io)
// parsing lives here and is invoked additively from the generic mapper, keyed on
// the report kind + API group. Nothing outside this file knows about Trivy.
//
// Trivy Operator emits one report object per scanned workload. We keep only the
// summary severity counts and the target workload reference on the Resource; the
// full vulnerabilities / checks arrays stay in the report object and are fetched
// on demand by the Trivy findings endpoint.

const trivyGroup = "aquasecurity.github.io"

// trivyReportTypes maps each report kind to the ReportType label surfaced to the
// frontend. The four kinds share an identical report.summary shape, so a single
// mapper handles all of them.
var trivyReportTypes = map[string]string{
	"VulnerabilityReport":  "vulnerability",
	"ConfigAuditReport":    "configAudit",
	"ExposedSecretReport":  "exposedSecret",
	"RbacAssessmentReport": "rbacAssessment",
}

// mapTrivyReport extracts the report summary and target workload reference into
// TrivyMetadata. The target is taken from the trivy-operator.resource.* labels
// the operator stamps on every report (more reliable than ownerReferences, which
// point at the intermediate ReplicaSet for Deployments).
func mapTrivyReport(el *kube.Resource, obj unstructured.Unstructured, reportType string) {
	summary, _, _ := unstructured.NestedMap(obj.Object, "report", "summary")

	el.TrivyMetadata = kube.TrivyMetadata{
		ReportType:      reportType,
		Critical:        nestedInt(summary, "criticalCount"),
		High:            nestedInt(summary, "highCount"),
		Medium:          nestedInt(summary, "mediumCount"),
		Low:             nestedInt(summary, "lowCount"),
		Unknown:         nestedInt(summary, "unknownCount"),
		TargetKind:      el.Labels["trivy-operator.resource.kind"],
		TargetName:      el.Labels["trivy-operator.resource.name"],
		TargetNamespace: el.Labels["trivy-operator.resource.namespace"],
	}

	// Reports are an overlay, not a node: a healthy report (no failed checks /
	// critical CVEs) maps to success, otherwise it warns. They never fail the
	// status, since findings are informational rather than a controller error.
	if el.TrivyMetadata.Critical > 0 || el.TrivyMetadata.High > 0 {
		el.Status = kube.StatusWarning
	} else {
		el.Status = kube.StatusSuccess
	}
}

// nestedInt reads an integer-valued field from a Trivy report summary, which the
// API server serialises as a JSON number (int64/float64). Missing values yield 0.
func nestedInt(obj map[string]any, field string) int {
	v, found, err := unstructured.NestedFieldNoCopy(obj, field)
	if !found || err != nil {
		return 0
	}
	switch n := v.(type) {
	case int64:
		return int(n)
	case float64:
		return int(n)
	default:
		return 0
	}
}
