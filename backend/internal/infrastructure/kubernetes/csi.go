package kubernetes

import (
	kube "github.com/timp4w/phi/internal/core/kubernetes"

	v1 "k8s.io/api/core/v1"
)

// This file is the CSI-driver provider: driver-specific PersistentVolume parsing
// lives here and is invoked additively from mapPVData. Nothing outside this file
// knows about a particular CSI driver. Support for another driver is added by
// extending the switch below without touching the generic PV mapping or the
// domain model.

const nfsCSIDriver = "nfs.csi.k8s.io"

// mapCSIDriverData enriches PVMetadata with driver-specific connection details
// pulled from spec.csi.volumeAttributes. It no-ops for PVs that are not CSI
// volumes or whose driver it doesn't recognise.
func mapCSIDriverData(meta *kube.PVMetadata, pv *v1.PersistentVolume) {
	if pv.Spec.CSI == nil {
		return
	}
	attrs := pv.Spec.CSI.VolumeAttributes
	switch pv.Spec.CSI.Driver {
	case nfsCSIDriver:
		// nfs.csi.k8s.io records the export it mounts in volumeAttributes:
		// server is the NFS host, share the exported path.
		meta.NFSServer = attrs["server"]
		meta.NFSShare = attrs["share"]
	}
}
