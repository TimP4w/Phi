package kubernetes

import (
	"testing"

	"github.com/stretchr/testify/assert"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
)

func TestToResource_VulnerabilityReport_Summary(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("VulnerabilityReport", "aquasecurity.github.io/v1alpha1", "replicaset-myapp-abc", "default")
	obj.Object["metadata"].(map[string]interface{})["labels"] = map[string]interface{}{
		"trivy-operator.resource.kind":      "Deployment",
		"trivy-operator.resource.name":      "myapp",
		"trivy-operator.resource.namespace": "default",
	}
	obj.Object["report"] = map[string]interface{}{
		"summary": map[string]interface{}{
			"criticalCount": int64(2),
			"highCount":     int64(5),
			"mediumCount":   int64(1),
			"lowCount":      int64(0),
			"unknownCount":  int64(3),
		},
	}

	res := mapper.ToResource(*obj, "vulnerabilityreports")

	assert.Equal(t, "vulnerability", res.TrivyMetadata.ReportType)
	assert.Equal(t, 2, res.TrivyMetadata.Critical)
	assert.Equal(t, 5, res.TrivyMetadata.High)
	assert.Equal(t, 1, res.TrivyMetadata.Medium)
	assert.Equal(t, 0, res.TrivyMetadata.Low)
	assert.Equal(t, 3, res.TrivyMetadata.Unknown)
	assert.Equal(t, "Deployment", res.TrivyMetadata.TargetKind)
	assert.Equal(t, "myapp", res.TrivyMetadata.TargetName)
	assert.Equal(t, "default", res.TrivyMetadata.TargetNamespace)
	// Critical/high findings warn (but never fail) the report's status.
	assert.Equal(t, kube.StatusWarning, res.Status)
}

func TestToResource_ConfigAuditReport_TypeAndCleanStatus(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("ConfigAuditReport", "aquasecurity.github.io/v1alpha1", "replicaset-clean", "default")
	obj.Object["report"] = map[string]interface{}{
		"summary": map[string]interface{}{
			"mediumCount": int64(4),
			"lowCount":    int64(2),
		},
	}

	res := mapper.ToResource(*obj, "configauditreports")

	assert.Equal(t, "configAudit", res.TrivyMetadata.ReportType)
	assert.Equal(t, 4, res.TrivyMetadata.Medium)
	// No critical/high → success.
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_NonTrivyGroup_Ignored(t *testing.T) {
	mapper := NewKubeMapper()
	// A same-named kind from a different group must not be parsed as a report.
	obj := newUnstructuredResource("VulnerabilityReport", "example.com/v1", "x", "default")

	res := mapper.ToResource(*obj, "vulnerabilityreports")

	assert.Nil(t, res.TrivyMetadata)
}
