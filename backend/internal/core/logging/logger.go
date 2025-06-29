package logging

import (
	"fmt"
	"os"
	"sync"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	globalLogger *zap.SugaredLogger
	once         sync.Once
)

// LogLevel represents the level of logging
type LogLevel string

const (
	DebugLevel LogLevel = "debug"
	InfoLevel  LogLevel = "info"
	WarnLevel  LogLevel = "warn"
	ErrorLevel LogLevel = "error"
	FatalLevel LogLevel = "fatal"
)

type Config struct {
	// Level sets the global log level (debug, info, warn, error, fatal)
	Level LogLevel
	// Development puts the logger in development mode, which changes the behavior of DPanicLevel
	Development bool
	// JSON enables structured JSON logging
	JSON bool
	// OutputPaths is a list of URLs or file paths to write logs to
	OutputPaths []string
	// ErrorOutputPaths is a list of URLs to write internal logger errors to
	ErrorOutputPaths []string
}

// DefaultConfig returns a default logging configuration
func DefaultConfig() Config {
	return Config{
		Level:            InfoLevel,
		Development:      false,
		JSON:             false,
		OutputPaths:      []string{"stdout"},
		ErrorOutputPaths: []string{"stderr"},
	}
}

// Init initializes the global logger with the given configuration
func Init(config Config) {
	once.Do(func() {
		globalLogger = createLogger(config)
	})
}

// createLogger creates a new zap logger with the given configuration
func createLogger(config Config) *zap.SugaredLogger {
	// Set default config if needed
	if len(config.OutputPaths) == 0 {
		config.OutputPaths = []string{"stdout"}
	}
	if len(config.ErrorOutputPaths) == 0 {
		config.ErrorOutputPaths = []string{"stderr"}
	}

	// Convert our level to zap level
	level := zapcore.InfoLevel
	switch config.Level {
	case DebugLevel:
		level = zapcore.DebugLevel
	case InfoLevel:
		level = zapcore.InfoLevel
	case WarnLevel:
		level = zapcore.WarnLevel
	case ErrorLevel:
		level = zapcore.ErrorLevel
	case FatalLevel:
		level = zapcore.FatalLevel
	}

	// Create the encoder config
	encoderConfig := zapcore.EncoderConfig{
		TimeKey:        "ts",
		LevelKey:       "level",
		NameKey:        "logger",
		CallerKey:      "caller",
		FunctionKey:    zapcore.OmitKey,
		MessageKey:     "msg",
		StacktraceKey:  "stacktrace",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel:    zapcore.CapitalColorLevelEncoder,
		EncodeTime:     zapcore.ISO8601TimeEncoder,
		EncodeDuration: zapcore.StringDurationEncoder,
		EncodeCaller:   zapcore.ShortCallerEncoder,
	}

	// Create the zap config
	zapConfig := zap.Config{
		Level:             zap.NewAtomicLevelAt(level),
		Development:       config.Development,
		DisableCaller:     false,
		DisableStacktrace: false,
		Sampling:          nil, // No sampling in development
		Encoding:          "console",
		EncoderConfig:     encoderConfig,
		OutputPaths:       config.OutputPaths,
		ErrorOutputPaths:  config.ErrorOutputPaths,
	}

	if config.JSON {
		zapConfig.Encoding = "json"
	}

	// Build the logger
	logger, err := zapConfig.Build(zap.AddCallerSkip(0))
	if err != nil {
		// If we can't build the logger, use a basic console logger
		fmt.Printf("Failed to initialize zap logger: %v\nFalling back to basic logger\n", err)
		basicConfig := zap.NewDevelopmentConfig()
		logger, _ = basicConfig.Build()
	}

	return logger.Sugar()
}

// getLogger returns the global logger, initializing with defaults if needed
func getLogger() *zap.SugaredLogger {
	if globalLogger == nil {
		Init(DefaultConfig())
	}
	return globalLogger
}

// Debug logs a message at debug level with optional fields
func Debug(msg string, args ...interface{}) {
	getLogger().Debugf(msg, args...)
}

// Info logs a message at info level with optional fields
func Info(msg string, args ...interface{}) {
	getLogger().Infof(msg, args...)
}

// Warn logs a message at warn level with optional fields
func Warn(msg string, args ...interface{}) {
	getLogger().Warnf(msg, args...)
}

// Fatal logs a message at fatal level with optional fields and then exits
func Fatal(msg string, args ...interface{}) {
	getLogger().Fatalf(msg, args...)
	// Zap's Fatal already calls os.Exit(1), but we'll add it here for clarity
	os.Exit(1)
}

// With creates a child logger with additional structured context
func With(fields map[string]interface{}) *zap.SugaredLogger {
	args := make([]interface{}, 0, len(fields)*2)
	for k, v := range fields {
		args = append(args, k, v)
	}
	return getLogger().With(args...)
}

// GetSugaredLogger returns the underlying sugared logger for more advanced usage
func GetSugaredLogger() *zap.SugaredLogger {
	return getLogger()
}

// GetZapLogger returns the underlying zap logger for more advanced usage
func GetZapLogger() *zap.Logger {
	return getLogger().Desugar()
}

// Sync flushes any buffered log entries. Applications should take care to call
// Sync before exiting.
func Sync() error {
	if globalLogger != nil {
		return globalLogger.Sync()
	}
	return nil
}
