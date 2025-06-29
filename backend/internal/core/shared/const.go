package shared

const (
	ENV_PHI_DEV              string = "PHI_DEV"              // ENV, if set it's a dev environment
	ENV_PHI_KUBE_CONFIG_PATH string = "PHI_KUBE_CONFIG_PATH" // ENV, mandatory in a dev environment
	PHI_KUBE_QPS             string = "PHI_KUBE_QPS"         // ENV, QPS for kube client (default 1000)
	PHI_KUBE_BURST           string = "PHI_KUBE_BURST"       // ENV, Burst for kube client (default 1000)
)
