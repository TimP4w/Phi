package kubernetes

import "strings"

// coreGroup is the placeholder group used in ref strings for core/v1 objects,
// whose apiVersion ("v1") carries no group segment.
const coreGroup = "core"

// ResourceRef identifies a resource by the canonical ref string
// `group/version/Kind:namespace/name`. It is the single source of truth for how
// that string is built and parsed, so every producer agrees on the format
// (notably the "core" group default for groupless core objects).
type ResourceRef struct {
	Group     string
	Version   string
	Kind      string
	Namespace string
	Name      string
}

// SplitAPIVersion splits a Kubernetes apiVersion into its group and version.
// A bare version (e.g. "v1") has no group segment and belongs to the core group.
func SplitAPIVersion(apiVersion string) (group, version string) {
	if i := strings.LastIndex(apiVersion, "/"); i >= 0 {
		return apiVersion[:i], apiVersion[i+1:]
	}
	return coreGroup, apiVersion
}

// NewRefFromAPIVersion builds a ResourceRef from an apiVersion string (e.g.
// "apps/v1" or "v1"), splitting it into group and version.
func NewRefFromAPIVersion(name, namespace, kind, apiVersion string) ResourceRef {
	group, version := SplitAPIVersion(apiVersion)
	return ResourceRef{Group: group, Version: version, Kind: kind, Namespace: namespace, Name: name}
}

// String renders the canonical `group/version/Kind:namespace/name` ref. An empty
// group (a groupless core object) is rendered as "core" so producers that carry
// the group separately agree with those that derive it from an apiVersion.
func (r ResourceRef) String() string {
	group := r.Group
	if group == "" {
		group = coreGroup
	}
	// Versions may still arrive as "group/version"; keep only the version segment.
	_, version := SplitAPIVersion(r.Version)
	return group + "/" + version + "/" + r.Kind + ":" + r.Namespace + "/" + r.Name
}
