package kubernetes

import (
	"strconv"
	"strings"

	kube "github.com/timp4w/phi/internal/core/kubernetes"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// This file is the Longhorn provider: all Longhorn-specific parsing lives here
// and is invoked additively from the generic mapper (keyed on the longhorn.io
// API group). Nothing outside this file knows about Longhorn. Other storage
// backends can be supported by adding sibling providers without touching the
// generic mapping or the domain model.

func mapLonghornVolume(el *kube.Resource, obj unstructured.Unstructured) {
	// A Longhorn Volume shares its name with the PersistentVolume it backs.
	el.ParentRefs = append(el.ParentRefs, makeRef(
		obj.GetName(),
		"", // cluster-scoped
		"PersistentVolume",
		"v1",
	))

	state, _, _ := unstructured.NestedString(obj.Object, "status", "state")
	robustness, _, _ := unstructured.NestedString(obj.Object, "status", "robustness")
	frontend, _, _ := unstructured.NestedString(obj.Object, "spec", "frontend")
	accessMode, _, _ := unstructured.NestedString(obj.Object, "spec", "accessMode")
	nodeID, _, _ := unstructured.NestedString(obj.Object, "status", "currentNodeID")

	el.LonghornVolumeMetadata = &kube.LonghornVolumeMetadata{
		State:            state,
		Robustness:       robustness,
		Size:             nestedNumber(obj.Object, "spec", "size"),
		ActualSize:       nestedNumber(obj.Object, "status", "actualSize"),
		NumberOfReplicas: nestedNumber(obj.Object, "spec", "numberOfReplicas"),
		NodeID:           nodeID,
		Frontend:         frontend,
		AccessMode:       accessMode,
	}

	appendUnstructuredConditions(el, obj)

	el.Status = mapLonghornVolumeStatus(obj, state, robustness)
}

// mapLonghornVolumeStatus ties the volume's readiness directly to its Longhorn
// robustness: healthy is ready regardless of attachment, degraded warns and
// faulted fails. Longhorn reports "unknown" robustness while detached (a normal
// idle state, ready) or mid-attach (still settling, pending).
func mapLonghornVolumeStatus(obj unstructured.Unstructured, state, robustness string) kube.Status {
	if obj.GetDeletionTimestamp() != nil {
		return kube.StatusPending
	}
	switch strings.ToLower(robustness) {
	case "healthy":
		return kube.StatusSuccess
	case "degraded":
		return kube.StatusWarning
	case "faulted":
		return kube.StatusFailed
	default: // unknown / empty
		if strings.EqualFold(state, "detached") || state == "" {
			return kube.StatusSuccess
		}
		return kube.StatusPending
	}
}

// mapLonghornNode aggregates the disk capacity reported by a Node.longhorn.io
// object into LonghornNodeMetadata, replicating how the Longhorn dashboard
// derives Total / Used / Reserved / Schedulable / Disabled.
func mapLonghornNode(el *kube.Resource, obj unstructured.Unstructured) {
	meta := kube.LonghornNodeMetadata{}

	// spec.allowScheduling defaults to true when Longhorn omits it.
	nodeAllow := true
	if a, found, _ := unstructured.NestedBool(obj.Object, "spec", "allowScheduling"); found {
		nodeAllow = a
	}

	specDisks, _, _ := unstructured.NestedMap(obj.Object, "spec", "disks")
	statusDisks, _, _ := unstructured.NestedMap(obj.Object, "status", "diskStatus")

	for name, raw := range statusDisks {
		ds, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		// storageScheduled is the space Longhorn has allocated to replicas; the
		// dashboard surfaces it as "Used" (distinct from raw filesystem usage).
		max := nestedNumber(ds, "storageMaximum")
		scheduled := nestedNumber(ds, "storageScheduled")
		meta.StorageMaximum += max

		var reserved int64
		allow := nodeAllow
		if sd, ok := specDisks[name].(map[string]any); ok {
			reserved = nestedNumber(sd, "storageReserved")
			if a, found, _ := unstructured.NestedBool(sd, "allowScheduling"); found {
				allow = allow && a
			}
		}

		// On a schedulable disk the capacity splits cleanly into
		// reserved + used(scheduled) + schedulable; a disabled disk's whole
		// capacity is unusable for scheduling.
		if allow {
			meta.StorageReserved += reserved
			meta.StorageUsed += scheduled
			if sched := max - reserved - scheduled; sched > 0 {
				meta.StorageSchedulable += sched
			}
		} else {
			meta.StorageDisabled += max
		}
	}

	for _, cond := range extractUnstructuredConditions(obj) {
		condType, _ := cond["type"].(string)
		condStatus, _ := cond["status"].(string)
		switch condType {
		case "Ready":
			meta.Ready = condStatus == "True"
		case "Schedulable":
			meta.Schedulable = condStatus == "True"
		}
	}

	el.LonghornNodeMetadata = &meta

	switch {
	case !meta.Ready:
		el.Status = kube.StatusFailed
	case !meta.Schedulable:
		el.Status = kube.StatusWarning
	default:
		el.Status = kube.StatusSuccess
	}
}

// nestedNumber reads an integer-valued field that Longhorn may serialise as a
// JSON number (int64/float64) or a string (e.g. spec.size). Missing or
// unparseable values yield 0.
func nestedNumber(obj map[string]any, fields ...string) int64 {
	v, found, err := unstructured.NestedFieldNoCopy(obj, fields...)
	if !found || err != nil {
		return 0
	}
	switch n := v.(type) {
	case int64:
		return n
	case float64:
		return int64(n)
	case string:
		parsed, _ := strconv.ParseInt(n, 10, 64)
		return parsed
	default:
		return 0
	}
}
