package shared

const (
	ENV_PHI_DEV              string = "PHI_DEV"              // ENV, if set it's a dev environment
	ENV_PHI_LOG_LEVEL        string = "PHI_LOG_LEVEL"        // ENV, log level (default info)
	ENV_PHI_KUBE_CONFIG_PATH string = "PHI_KUBE_CONFIG_PATH" // ENV, mandatory in a dev environment
	ENV_PHI_ALLOWED_ORIGIN   string = "PHI_ALLOWED_ORIGIN"   // ENV, CORS allowed origin (default same-origin)
	PHI_KUBE_QPS             string = "PHI_KUBE_QPS"         // ENV, QPS for kube client (default 1000)
	PHI_KUBE_BURST           string = "PHI_KUBE_BURST"       // ENV, Burst for kube client (default 1000)
)
