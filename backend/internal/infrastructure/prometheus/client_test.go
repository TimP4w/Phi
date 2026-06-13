package prometheus

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/metrics"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func emptyStore(t *testing.T) *mocks.KubeStore {
	s := mocks.NewKubeStore(t)
	s.On("GetResources").Return(map[string]*kubernetes.Resource{}).Maybe()
	return s
}

func TestLocatorEnvOverride(t *testing.T) {
	t.Setenv("PHI_PROMETHEUS_URL", "http://prom.example:9090")
	l := newLocator(emptyStore(t))
	url, err := l.Resolve()
	assert.NoError(t, err)
	assert.Equal(t, "http://prom.example:9090", url)
}

func TestLocatorDisabled(t *testing.T) {
	t.Setenv("PHI_PROMETHEUS_ENABLED", "false")
	t.Setenv("PHI_PROMETHEUS_URL", "http://ignored:9090")
	l := newLocator(emptyStore(t))
	_, err := l.Resolve()
	assert.ErrorIs(t, err, metrics.ErrDisabled)
}

func TestLocatorDiscoversServiceByLabel(t *testing.T) {
	t.Setenv("PHI_PROMETHEUS_URL", "")
	s := mocks.NewKubeStore(t)
	s.On("GetResources").Return(map[string]*kubernetes.Resource{
		"svc1": {UID: "svc1", Kind: "Service", Name: "kps-prometheus", Namespace: "monitoring",
			Labels: map[string]string{"app.kubernetes.io/name": "prometheus"}},
	})
	l := newLocator(s)
	url, err := l.Resolve()
	assert.NoError(t, err)
	assert.Equal(t, "http://kps-prometheus.monitoring.svc:9090", url)
}

func TestLocatorNotFoundIsDisabled(t *testing.T) {
	t.Setenv("PHI_PROMETHEUS_URL", "") // hermetic even if the dev shell exports it
	l := newLocator(emptyStore(t))
	_, err := l.Resolve()
	assert.ErrorIs(t, err, metrics.ErrDisabled)
}

func promServer(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	t.Setenv("PHI_PROMETHEUS_URL", srv.URL)
	return srv
}

func TestQueryParsesVector(t *testing.T) {
	promServer(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/query", r.URL.Path)
		r.ParseForm()
		assert.Equal(t, "up", r.Form.Get("query"))
		w.Write([]byte(`{"status":"success","data":{"resultType":"vector","result":[
			{"metric":{"instance":"node1"},"value":[1718200000.123,"1.5"]}]}}`))
	})
	c := NewClient(emptyStore(t))
	res, err := c.Query(context.Background(), "up", time.Now())
	assert.NoError(t, err)
	assert.Len(t, res, 1)
	assert.Equal(t, "node1", res[0].Labels["instance"])
	assert.Equal(t, int64(1718200000), res[0].Samples[0].Timestamp)
	assert.Equal(t, 1.5, res[0].Samples[0].Value)
}

func TestQueryRangeParsesMatrix(t *testing.T) {
	promServer(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/query_range", r.URL.Path)
		w.Write([]byte(`{"status":"success","data":{"resultType":"matrix","result":[
			{"metric":{},"values":[[1718200000,"1"],[1718200030,"2"]]}]}}`))
	})
	c := NewClient(emptyStore(t))
	res, err := c.QueryRange(context.Background(), "q", time.Now().Add(-time.Hour), time.Now(), 30*time.Second)
	assert.NoError(t, err)
	assert.Len(t, res, 1)
	assert.Len(t, res[0].Samples, 2)
	assert.Equal(t, 2.0, res[0].Samples[1].Value)
}

func TestQueryServerErrorIsUnavailable(t *testing.T) {
	promServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	})
	c := NewClient(emptyStore(t))
	_, err := c.Query(context.Background(), "up", time.Now())
	assert.ErrorIs(t, err, metrics.ErrUnavailable)
}

func TestStatusActive(t *testing.T) {
	promServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/-/ready" {
			w.WriteHeader(http.StatusOK)
			return
		}
	})
	c := NewClient(emptyStore(t))
	st := c.Status()
	assert.Equal(t, metrics.IntegrationActive, st.Status)
	assert.Equal(t, "prometheus", st.Name)
}

func TestStatusDisabledWhenNotConfigured(t *testing.T) {
	t.Setenv("PHI_PROMETHEUS_URL", "")
	c := NewClient(emptyStore(t))
	assert.Equal(t, metrics.IntegrationDisabled, c.Status().Status)
}

func TestStatusUnavailableWhenUnreachable(t *testing.T) {
	t.Setenv("PHI_PROMETHEUS_URL", "http://127.0.0.1:1") // nothing listens here
	c := NewClient(emptyStore(t))
	assert.Equal(t, metrics.IntegrationUnavailable, c.Status().Status)
}

func TestQueryErrorEnvelope(t *testing.T) {
	promServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"error","errorType":"bad_data","error":"parse error at char 3"}`))
	})
	c := NewClient(emptyStore(t))
	_, err := c.Query(context.Background(), "sum(", time.Now())
	assert.ErrorContains(t, err, "parse error at char 3")
}
