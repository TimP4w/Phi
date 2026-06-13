package prometheus

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/metrics"
)

type Client struct {
	httpClient *http.Client
	locator    *locator
	logger     *logging.PhiLogger
}

// NewClient builds the Prometheus API client. Provided to fx as the
// metrics.PrometheusService implementation.
func NewClient(store kube.KubeStore) PrometheusService {
	return &Client{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		locator:    newLocator(store),
		logger:     logging.Logger(),
	}
}

func (c *Client) Query(ctx context.Context, query string, ts time.Time) ([]SeriesResult, error) {
	form := url.Values{
		"query": {query},
		"time":  {strconv.FormatInt(ts.Unix(), 10)},
	}
	return c.call(ctx, "/api/v1/query", form, query)
}

func (c *Client) QueryRange(ctx context.Context, query string, start, end time.Time, step time.Duration) ([]SeriesResult, error) {
	form := url.Values{
		"query": {query},
		"start": {strconv.FormatInt(start.Unix(), 10)},
		"end":   {strconv.FormatInt(end.Unix(), 10)},
		"step":  {strconv.FormatFloat(step.Seconds(), 'f', -1, 64)},
	}
	return c.call(ctx, "/api/v1/query_range", form, query)
}

func (c *Client) Status() metrics.IntegrationStatus {
	status := metrics.IntegrationStatus{Name: "prometheus", Status: metrics.IntegrationDisabled}
	base, err := c.locator.Resolve()
	if err != nil {
		return status
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/-/ready", nil)
	if err != nil {
		status.Status = metrics.IntegrationUnavailable
		return status
	}
	resp, err := c.httpClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		status.Status = metrics.IntegrationUnavailable
		return status
	}
	resp.Body.Close()
	status.Status = metrics.IntegrationActive
	return status
}

// call POSTs the form (pod regexes can exceed URL length limits) and parses
// the Prometheus API envelope.
func (c *Client) call(ctx context.Context, path string, form url.Values, query string) ([]SeriesResult, error) {
	base, err := c.locator.Resolve()
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+path, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.logger.WithError(err).WithField("query", query).Warn("Prometheus request failed")
		return nil, fmt.Errorf("%w: %v", metrics.ErrUnavailable, err)
	}
	// Drain before close so the keep-alive connection can be reused.
	defer func() {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}()
	if resp.StatusCode != http.StatusOK {
		c.logger.WithField("query", query).WithField("status", resp.StatusCode).Warn("Prometheus returned non-200")
		return nil, fmt.Errorf("%w: status %d", metrics.ErrUnavailable, resp.StatusCode)
	}

	var body promResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("decoding prometheus response: %w", err)
	}
	if body.Status != "success" {
		return nil, fmt.Errorf("prometheus query failed: %s", body.Error)
	}

	results := make([]SeriesResult, 0, len(body.Data.Result))
	for _, r := range body.Data.Result {
		sr := SeriesResult{Labels: r.Metric}
		if len(r.Value) == 2 {
			if s, ok := parseSample(r.Value); ok {
				sr.Samples = append(sr.Samples, s)
			}
		}
		for _, pair := range r.Values {
			if s, ok := parseSample(pair); ok {
				sr.Samples = append(sr.Samples, s)
			}
		}
		results = append(results, sr)
	}
	return results, nil
}

type promResponse struct {
	Status string `json:"status"`
	Error  string `json:"error"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Value  []any             `json:"value"`
			Values [][]any           `json:"values"`
		} `json:"result"`
	} `json:"data"`
}

func parseSample(pair []any) (metrics.Sample, bool) {
	if len(pair) != 2 {
		return metrics.Sample{}, false
	}
	ts, ok := pair[0].(float64)
	if !ok {
		return metrics.Sample{}, false
	}
	vs, ok := pair[1].(string)
	if !ok {
		return metrics.Sample{}, false
	}
	v, err := strconv.ParseFloat(vs, 64)
	if err != nil {
		return metrics.Sample{}, false
	}
	return metrics.Sample{Timestamp: int64(ts), Value: v}, true
}
