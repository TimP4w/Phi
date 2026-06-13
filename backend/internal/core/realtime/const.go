package realtime

const (
	PING             string = "PING"
	PONG             string = "PONG"
	CONNECTED        string = "CONNECTED"
	EVENT            string = "EVENT"
	LOG              string = "LOG"
	START_WATCH_LOGS string = "START_WATCH_LOGS"
	RESOURCE_SYNC    string = "RESOURCE_SYNC"
	RESOURCE_PATCH   string = "RESOURCE_PATCH"

	START_WATCH_METRICS string = "START_WATCH_METRICS"
	STOP_WATCH_METRICS  string = "STOP_WATCH_METRICS"
	METRICS_CURRENT     string = "METRICS_CURRENT"
	METRICS_NODES       string = "METRICS_NODES"
	METRICS_RESOURCE    string = "METRICS_RESOURCE"
	METRICS_STATUS      string = "METRICS_STATUS"
	METRICS_STORAGE     string = "METRICS_STORAGE"
)

const (
	PatchOpUpsert = "upsert"
	PatchOpDelete = "delete"
)
