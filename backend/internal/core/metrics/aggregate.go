package metrics

import "sort"

// PodKey identifies a pod by namespace and name. It is the join key for the
// per-pod series and spec maps aggregated below.
type PodKey struct {
	Namespace string
	Name      string
}

// SumSeries adds per-pod series pointwise, aligned by timestamp.
func SumSeries(byPod map[PodKey]Series, keys []PodKey) Series {
	acc := map[int64]float64{}
	for _, k := range keys {
		for _, s := range byPod[k] {
			acc[s.Timestamp] += s.Value
		}
	}
	ts := make([]int64, 0, len(acc))
	for t := range acc {
		ts = append(ts, t)
	}
	sort.Slice(ts, func(i, j int) bool { return ts[i] < ts[j] })
	out := make(Series, 0, len(ts))
	for _, t := range ts {
		out = append(out, Sample{Timestamp: t, Value: acc[t]})
	}
	return out
}

// AggregateSpec sums requests/limits over the given pods. A value is reported
// only when every container in the set defines it: Requests is nil unless each
// pod's request count covers all of its containers, and Limits likewise. This
// keeps a summed total from silently understating a partially-specified set
// (the same coverage rule the server-side detail path applies).
func AggregateSpec(keys []PodKey, req, lim, reqCount, containers, limCount map[PodKey]float64) SpecValue {
	var sv SpecValue
	reqSum, reqOK := 0.0, len(keys) > 0
	limSum, limOK := 0.0, len(keys) > 0
	for _, k := range keys {
		c := containers[k]
		if c == 0 {
			// No container info for this pod: cannot trust coverage of either.
			reqOK, limOK = false, false
			continue
		}
		if rc, ok := reqCount[k]; !ok || rc < c {
			reqOK = false
		} else {
			reqSum += req[k]
		}
		if lc, ok := limCount[k]; !ok || lc < c {
			limOK = false
		} else {
			limSum += lim[k]
		}
	}
	if reqOK {
		sv.Requests = &reqSum
	}
	if limOK {
		sv.Limits = &limSum
	}
	return sv
}
