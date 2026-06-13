package kubernetesusecases

import (
	"encoding/json"
	"fmt"

	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	shared "github.com/timp4w/phi/internal/core/shared"
	"sigs.k8s.io/yaml"
)

type GetTrivyFindingsInput struct {
	ResourceUid string
}

// TrivyFindings is the on-demand detail payload for one report: the parsed
// findings array (kept off the WebSocket stream because it can be large). Items
// is passed through verbatim from the report object so the frontend renders
// whatever fields the operator emits.
type TrivyFindings struct {
	ReportType string                   `json:"reportType"`
	Target     kubernetes.TrivyMetadata `json:"target"`
	Items      []map[string]any         `json:"items"`
}

type GetTrivyFindingsUseCase struct {
	kubeService kubernetes.KubeService
	kubeStore   kubernetes.KubeStore
	logger      logging.PhiLogger
}

func NewGetTrivyFindingsUseCase(KubeService kubernetes.KubeService, KubeStore kubernetes.KubeStore) shared.UseCase[GetTrivyFindingsInput, TrivyFindings] {
	return &GetTrivyFindingsUseCase{
		kubeService: KubeService,
		kubeStore:   KubeStore,
		logger:      *logging.Logger(),
	}
}

// trivyItemsKey maps each report type to the report sub-field that holds its
// findings array.
var trivyItemsKey = map[string]string{
	"vulnerability":  "vulnerabilities",
	"configAudit":    "checks",
	"rbacAssessment": "checks",
	"exposedSecret":  "secrets",
}

func (uc *GetTrivyFindingsUseCase) Execute(in GetTrivyFindingsInput) (TrivyFindings, error) {
	logger := uc.logger.WithField(string(logging.ResourceUID), in.ResourceUid)

	resource := uc.kubeStore.GetResourceByUID(in.ResourceUid)
	if resource == nil {
		return TrivyFindings{}, fmt.Errorf("resource not found: %w", kubernetes.ErrNotFound)
	}
	if resource.TrivyMetadata.ReportType == "" {
		return TrivyFindings{}, fmt.Errorf("resource is not a Trivy report: %w", kubernetes.ErrNotFound)
	}

	yamlData, err := uc.kubeService.GetResourceYAML(*resource)
	if err != nil {
		return TrivyFindings{}, err
	}

	// GetResourceYAML marshals the unstructured object with gopkg.in/yaml.v2,
	// which nests the whole object under a top-level "object" key. Accept either
	// shape so this does not silently break if that serialization ever changes.
	type reportHolder struct {
		Report map[string]json.RawMessage `json:"report"`
	}
	var parsed struct {
		reportHolder
		Object reportHolder `json:"object"`
	}
	if err := yaml.Unmarshal(yamlData, &parsed); err != nil {
		logger.WithError(err).Error("Failed to parse Trivy report")
		return TrivyFindings{}, fmt.Errorf("failed to parse Trivy report: %w", err)
	}
	report := parsed.Report
	if report == nil {
		report = parsed.Object.Report
	}

	items := []map[string]any{}
	if raw, ok := report[trivyItemsKey[resource.TrivyMetadata.ReportType]]; ok {
		if err := json.Unmarshal(raw, &items); err != nil {
			logger.WithError(err).Warn("Failed to parse Trivy findings array")
		}
	}

	return TrivyFindings{
		ReportType: resource.TrivyMetadata.ReportType,
		Target:     resource.TrivyMetadata,
		Items:      items,
	}, nil
}
