package kubernetes

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestGroupKind(t *testing.T) {
	assert.Equal(t, schema.GroupKind{Group: "", Kind: "Pod"}, (&Resource{Kind: "Pod"}).GroupKind())
	assert.Equal(t,
		schema.GroupKind{Group: "apps", Kind: "Deployment"},
		(&Resource{Kind: "Deployment", Group: "apps"}).GroupKind())
}

func TestClassificationPredicates(t *testing.T) {
	app := &Resource{Kind: "Kustomization", Group: "kustomize.toolkit.fluxcd.io"}
	assert.True(t, app.IsReconcilable())
	assert.True(t, app.IsSuspendable())
	assert.Equal(t, FluxRoleApplication, app.FluxRole())

	repo := &Resource{Kind: "GitRepository", Group: "source.toolkit.fluxcd.io"}
	assert.True(t, repo.IsReconcilable())
	assert.Equal(t, FluxRoleRepository, repo.FluxRole())

	pod := &Resource{Kind: "Pod"}
	assert.False(t, pod.IsReconcilable())
	assert.Equal(t, FluxRoleNone, pod.FluxRole())
	assert.True(t, pod.HasMetrics())

	secret := &Resource{Kind: "Secret"}
	assert.True(t, secret.IsStaticSuccess())
	assert.False(t, secret.HasMetrics())
}

// Same kind name, different group: only the real flux Kustomization classifies
// as reconcilable — a groupless "Kustomization" (e.g. the kustomize.config.k8s.io
// kind) does not.
func TestClassificationIsGroupAware(t *testing.T) {
	assert.True(t, (&Resource{Kind: "Kustomization", Group: "kustomize.toolkit.fluxcd.io"}).IsReconcilable())
	assert.False(t, (&Resource{Kind: "Kustomization"}).IsReconcilable())
}

func TestClassificationForUnknownIsZero(t *testing.T) {
	assert.Equal(t, Classification{}, ClassificationFor(schema.GroupKind{Kind: "Widget", Group: "example.com"}))
}

func TestMarshalJSONEmitsClassification(t *testing.T) {
	var ks map[string]any
	b, err := json.Marshal(Resource{Kind: "Kustomization", Group: "kustomize.toolkit.fluxcd.io"})
	assert.NoError(t, err)
	assert.NoError(t, json.Unmarshal(b, &ks))
	assert.Equal(t, true, ks["isReconcilable"])
	assert.Equal(t, "application", ks["fluxRole"])
	assert.Equal(t, true, ks["hasMetrics"])

	var pod map[string]any
	b, err = json.Marshal(Resource{Kind: "Pod"})
	assert.NoError(t, err)
	assert.NoError(t, json.Unmarshal(b, &pod))
	assert.Equal(t, false, pod["isReconcilable"])
	assert.Equal(t, true, pod["hasMetrics"])
	_, hasFluxRole := pod["fluxRole"] // omitempty drops it for non-flux resources
	assert.False(t, hasFluxRole)
}
