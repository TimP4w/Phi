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
)

const (
	PatchOpUpsert = "upsert"
	PatchOpDelete = "delete"
)
