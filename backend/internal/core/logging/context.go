package logging

import (
	"go.uber.org/zap"
)

// Component represents a logical part of the application
type Component string

const (
	// Server component for server-related logs
	Server Component = "server"
	// Kubernetes component for Kubernetes-related logs
	Kubernetes Component = "kubernetes"
	// TreeService component for tree service logs
	TreeService Component = "tree-service"
	// WebSocket component for websocket-related logs
	WebSocket Component = "websocket"
	// API component for API-related logs
	API Component = "api"
	// Core component for core functionality logs
	Core Component = "core"
	// Discovery component for discovery-related logs
	Discovery Component = "discovery"
)

type LogField string

const (
	// ResourceUID for resource UID
	ResourceUID LogField = "resource_uid"
	// ResourceKind for resource kind
	ResourceKind LogField = "resource_kind"
	// ResourceName for resource name
	ResourceName LogField = "resource_name"
	// ResourceNamespace for resource namespace
	ResourceNamespace LogField = "resource_namespace"
	// ClientID for websocket client identifier
	ClientID LogField = "client_id"
	// Error for error message
	Error LogField = "error"
	// Duration for operation duration
	Duration LogField = "duration_ms"
)

// PhiLogger represents a logger for a specific component
type PhiLogger struct {
	*zap.SugaredLogger
}

// NewPhiLogger creates a new component logger
func NewPhiLogger() *PhiLogger {
	return &PhiLogger{
		SugaredLogger: getLogger(),
	}
}

// WithField adds a field to the logger
func (l *PhiLogger) WithField(key string, value interface{}) *PhiLogger {
	return &PhiLogger{
		SugaredLogger: l.SugaredLogger.With(key, value),
	}
}

// WithFields adds multiple fields to the logger
func (l *PhiLogger) WithFields(fields map[string]interface{}) *PhiLogger {
	args := make([]interface{}, 0, len(fields)*2)
	for k, v := range fields {
		args = append(args, k, v)
	}
	return &PhiLogger{
		SugaredLogger: l.SugaredLogger.With(args...),
	}
}

// WithError adds an error field to the logger
func (l *PhiLogger) WithError(err error) *PhiLogger {
	if err == nil {
		return l
	}
	return &PhiLogger{
		SugaredLogger: l.SugaredLogger.With(string(Error), err.Error()),
	}
}

// WithResource adds resource information to the logger
func (l *PhiLogger) WithResource(kind, name, namespace, uid string) *PhiLogger {
	return &PhiLogger{
		SugaredLogger: l.SugaredLogger.With(
			string(ResourceKind), kind,
			string(ResourceName), name,
			string(ResourceNamespace), namespace,
			string(ResourceUID), uid,
		),
	}
}

// WithClient adds client information to the logger
func (l *PhiLogger) WithClient(clientID string) *PhiLogger {
	return &PhiLogger{
		SugaredLogger: l.SugaredLogger.With(string(ClientID), clientID),
	}
}

func Logger() *PhiLogger {
	return NewPhiLogger()
}
