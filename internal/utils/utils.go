package utils

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func ToPtr[T any](v T) *T {
	return &v
}

func ToPtrIfNonZero(v float64) *float64 {
	if v == 0 {
		return nil
	}
	return &v
}

func NewLogger(level string) (*zap.Logger, error) {

	if level == "" {

		level = "info"

	}

	zapLevel, err := zapcore.ParseLevel(level)

	if err != nil {

		return nil, err

	}

	var config zap.Config

	if zapLevel == zap.DebugLevel {

		config = zap.NewDevelopmentConfig()

		config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder

	} else {

		config = zap.NewProductionConfig()

	}

	config.Level = zap.NewAtomicLevelAt(zapLevel)

	config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder

	return config.Build()

}
