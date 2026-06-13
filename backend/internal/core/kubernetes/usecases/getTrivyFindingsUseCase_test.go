package kubernetesusecases

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

// Production marshals the unstructured object with yaml.v2, which nests
// everything under a top-level "object" key — the parser must handle that.
const vulnReportYAML = `object:
  apiVersion: aquasecurity.github.io/v1alpha1
  kind: VulnerabilityReport
  metadata:
    name: replicaset-myapp
  report:
    summary:
      criticalCount: 1
    vulnerabilities:
      - vulnerabilityID: CVE-2024-0001
        severity: CRITICAL
        resource: libssl
      - vulnerabilityID: CVE-2024-0002
        severity: HIGH
        resource: libc
`

func TestGetTrivyFindingsUseCase_ParsesVulnerabilities(t *testing.T) {
	store := mocks.NewKubeStore(t)
	kubeSvc := mocks.NewKubeService(t)

	res := &kube.Resource{UID: "report-uid", TrivyMetadata: kube.TrivyMetadata{ReportType: "vulnerability", TargetName: "myapp"}}
	store.On("GetResourceByUID", "report-uid").Return(res)
	kubeSvc.On("GetResourceYAML", *res).Return([]byte(vulnReportYAML), nil)

	uc := NewGetTrivyFindingsUseCase(kubeSvc, store)
	out, err := uc.Execute(GetTrivyFindingsInput{ResourceUid: "report-uid"})

	require.NoError(t, err)
	assert.Equal(t, "vulnerability", out.ReportType)
	assert.Equal(t, "myapp", out.Target.TargetName)
	require.Len(t, out.Items, 2)
	assert.Equal(t, "CVE-2024-0001", out.Items[0]["vulnerabilityID"])
}

func TestGetTrivyFindingsUseCase_NotFound(t *testing.T) {
	store := mocks.NewKubeStore(t)
	kubeSvc := mocks.NewKubeService(t)

	store.On("GetResourceByUID", "missing").Return((*kube.Resource)(nil))

	uc := NewGetTrivyFindingsUseCase(kubeSvc, store)
	_, err := uc.Execute(GetTrivyFindingsInput{ResourceUid: "missing"})

	assert.ErrorIs(t, err, kube.ErrNotFound)
	kubeSvc.AssertNotCalled(t, "GetResourceYAML")
}

func TestGetTrivyFindingsUseCase_NotATrivyReport(t *testing.T) {
	store := mocks.NewKubeStore(t)
	kubeSvc := mocks.NewKubeService(t)

	res := &kube.Resource{UID: "pod-uid"} // no TrivyMetadata
	store.On("GetResourceByUID", "pod-uid").Return(res)

	uc := NewGetTrivyFindingsUseCase(kubeSvc, store)
	_, err := uc.Execute(GetTrivyFindingsInput{ResourceUid: "pod-uid"})

	assert.ErrorIs(t, err, kube.ErrNotFound)
	kubeSvc.AssertNotCalled(t, "GetResourceYAML")
}
