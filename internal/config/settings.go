package config

import "time"

type PowerwallOptions struct {
	Endpoint  string `mapstructure:"endpoint" yaml:"endpoint" json:"endpoint"`
	Password  string `mapstructure:"password" yaml:"password" json:"password"`
	DebugMode bool   `mapstructure:"debug" yaml:"debug,omitempty" json:"debug,omitempty"`
}

type StorageOptions struct {
	DataPath          string `mapstructure:"path" yaml:"path,omitempty" json:"path,omitempty"`
	Retention         string `mapstructure:"retention" yaml:"retention,omitempty" json:"retention,omitempty"`
	PartitionDuration string `mapstructure:"partition" yaml:"partition,omitempty" json:"partition,omitempty"`
}

func (s StorageOptions) GetRetention() time.Duration {
	if s.Retention == "" {
		return 0 // Infinity
	}
	d, _ := time.ParseDuration(s.Retention)
	return d
}

func (s StorageOptions) GetPartitionDuration() time.Duration {
	if s.PartitionDuration == "" {
		return 2 * time.Hour // Default block size
	}
	d, _ := time.ParseDuration(s.PartitionDuration)
	if d == 0 {
		return 2 * time.Hour
	}
	return d
}

type ProxyOptions struct {
	ConfigPath         string `mapstructure:"-" yaml:"-" json:"-"`
	PowerwallOptions   `mapstructure:",squash" yaml:",inline"`
	CollectionInterval uint32 `mapstructure:"collection-interval" yaml:"collection-interval,omitempty" json:"collection-interval,omitempty"`
	AutoRefresh        bool   `mapstructure:"auto-refresh" yaml:"auto-refresh,omitempty" json:"auto-refresh,omitempty"`
	DefaultTheme       string `mapstructure:"default-theme" yaml:"default-theme,omitempty" json:"default-theme,omitempty"`
	LogLevel           string `mapstructure:"log-level" yaml:"log-level,omitempty" json:"log-level,omitempty"`
	DisableCollector   bool   `mapstructure:"no-collector" yaml:"no-collector,omitempty" json:"no-collector,omitempty"`

	ListenOn        string            `mapstructure:"listen" yaml:"listen,omitempty" json:"listen,omitempty"`
	Storage         StorageOptions    `mapstructure:"storage" yaml:"storage,omitempty" json:"storage,omitempty"`
	Dashboards      []DashboardConfig `mapstructure:"dashboards" yaml:"dashboards,omitempty" json:"dashboards,omitempty"`
	LabelConfigPath string            `mapstructure:"label-config" yaml:"label-config,omitempty" json:"label-config,omitempty"`
}

func NewDefaultProxyOptions() ProxyOptions {
	return ProxyOptions{
		PowerwallOptions: PowerwallOptions{
			Endpoint: "https://192.168.91.1/",
		},
		CollectionInterval: 30,
		AutoRefresh:        true,
		DefaultTheme:       "auto",
		LogLevel:           "info",
		ListenOn:           ":8080",
		Storage: StorageOptions{
			DataPath:          "/data",
			Retention:         "0s",
			PartitionDuration: "2h",
		},
	}
}
