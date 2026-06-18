package kubernetesusecases

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

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

const (
	// trivyFindingsTTL bounds how long a parsed report is reused. Trivy rescans
	// are infrequent, and a changed report also invalidates the entry via its
	// summary signature, so this is only a backstop for content that changed
	// without the counts changing.
	trivyFindingsTTL = 10 * time.Minute
	// maxConcurrentTrivyFetches caps how many reports are fetched from the API
	// server at once. A cluster can hold hundreds of reports; opening a
	// cluster-wide modal must not fan out an unbounded number of live GETs and
	// overwhelm the backend (and the API server) — the rest queue behind these.
	maxConcurrentTrivyFetches = 4
)

type cachedTrivyFindings struct {
	meta     kubernetes.TrivyMetadata
	findings TrivyFindings
	at       time.Time
}

type GetTrivyFindingsUseCase struct {
	kubeService kubernetes.KubeService
	kubeStore   kubernetes.KubeStore
	logger      logging.PhiLogger

	sem chan struct{}

	mu    sync.Mutex
	cache map[string]cachedTrivyFindings
}

func NewGetTrivyFindingsUseCase(KubeService kubernetes.KubeService, KubeStore kubernetes.KubeStore) shared.UseCase[GetTrivyFindingsInput, TrivyFindings] {
	return &GetTrivyFindingsUseCase{
		kubeService: KubeService,
		kubeStore:   KubeStore,
		logger:      *logging.Logger(),
		sem:         make(chan struct{}, maxConcurrentTrivyFetches),
		cache:       make(map[string]cachedTrivyFindings),
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
	if resource.TrivyMetadata == nil || resource.TrivyMetadata.ReportType == "" {
		return TrivyFindings{}, fmt.Errorf("resource is not a Trivy report: %w", kubernetes.ErrNotFound)
	}

	// Serve from cache when the report is unchanged (same summary signature) and
	// the entry is still fresh. This makes reopening a modal essentially free and
	// keeps repeated opens off the API server entirely.
	if cached, ok := uc.cachedFindings(in.ResourceUid, *resource.TrivyMetadata); ok {
		return cached, nil
	}

	// Bound concurrent live fetches so a burst of opens cannot flood the backend.
	uc.sem <- struct{}{}
	defer func() { <-uc.sem }()

	// Another request may have populated the cache while we waited on the
	// semaphore — re-check before doing the work.
	if cached, ok := uc.cachedFindings(in.ResourceUid, *resource.TrivyMetadata); ok {
		return cached, nil
	}

	findings, err := uc.fetchFindings(*resource, logger)
	if err != nil {
		return TrivyFindings{}, err
	}

	uc.mu.Lock()
	uc.cache[in.ResourceUid] = cachedTrivyFindings{
		meta:     *resource.TrivyMetadata,
		findings: findings,
		at:       time.Now(),
	}
	uc.mu.Unlock()

	return findings, nil
}

// cachedFindings returns a cached payload when one exists for the report, its
// summary still matches (so the report has not been rescanned) and it has not
// expired.
func (uc *GetTrivyFindingsUseCase) cachedFindings(uid string, meta kubernetes.TrivyMetadata) (TrivyFindings, bool) {
	uc.mu.Lock()
	defer uc.mu.Unlock()
	entry, ok := uc.cache[uid]
	if !ok || entry.meta != meta || time.Since(entry.at) > trivyFindingsTTL {
		return TrivyFindings{}, false
	}
	return entry.findings, true
}

func (uc *GetTrivyFindingsUseCase) fetchFindings(resource kubernetes.Resource, logger *logging.PhiLogger) (TrivyFindings, error) {
	yamlData, err := uc.kubeService.GetResourceYAML(resource)
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
		Target:     *resource.TrivyMetadata,
		Items:      items,
	}, nil
}
