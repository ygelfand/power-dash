package config

import (
	"os"
	"path/filepath"
	"sync"

	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
)

type LabelConfig struct {
	Global map[string]string `yaml:"global" json:"global"`
}

type LabelManager struct {
	mu     sync.RWMutex
	path   string
	Config LabelConfig
	logger *zap.Logger
}

func NewLabelManager(mainConfigPath string, explicitPath string, logger *zap.Logger) *LabelManager {
	var path string
	if explicitPath != "" {
		path = explicitPath
	} else if mainConfigPath != "" {
		dir := filepath.Dir(mainConfigPath)
		path = filepath.Join(dir, "power-dash-labels.yaml")
	} else {
		path = "power-dash-labels.yaml"
	}

	lm := &LabelManager{
		path:   path,
		Config: LabelConfig{Global: make(map[string]string)},
		logger: logger,
	}

	if err := lm.Load(); err != nil {
		// If file doesn't exist, that's fine, we start with empty
		if !os.IsNotExist(err) {
			logger.Warn("Failed to load labels config", zap.String("path", path), zap.Error(err))
		}
	}
	return lm
}

func (lm *LabelManager) Load() error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	data, err := os.ReadFile(lm.path)
	if err != nil {
		return err
	}

	var cfg LabelConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return err
	}
	if cfg.Global == nil {
		cfg.Global = make(map[string]string)
	}
	lm.Config = cfg
	return nil
}

func (lm *LabelManager) Save(newConfig LabelConfig) error {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	data, err := yaml.Marshal(newConfig)
	if err != nil {
		return err
	}

	if err := os.WriteFile(lm.path, data, 0o644); err != nil {
		return err
	}
	lm.Config = newConfig
	return nil
}

func (lm *LabelManager) IsWritable() bool {
	// Check if file exists
	_, err := os.Stat(lm.path)
	if err == nil {
		// File exists, try to open for writing to check permissions
		f, err := os.OpenFile(lm.path, os.O_WRONLY, 0o666)
		if err != nil {
			return false
		}
		f.Close()
		return true
	}
	if os.IsNotExist(err) {
		// File doesn't exist, check if directory is writable
		dir := filepath.Dir(lm.path)
		f, err := os.CreateTemp(dir, "perm_check")
		if err != nil {
			return false
		}
		f.Close()
		os.Remove(f.Name())
		return true
	}
	return false
}
