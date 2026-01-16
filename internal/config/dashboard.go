package config

type DashboardConfig struct {
	Name      string        `mapstructure:"name" yaml:"name" json:"name"`
	Timeframe string        `mapstructure:"timeframe" yaml:"timeframe,omitempty" json:"timeframe,omitempty"`
	Panels    []PanelConfig `mapstructure:"panels" yaml:"panels" json:"panels"`
}

type PanelConfig struct {
	Name      string          `mapstructure:"name" yaml:"name" json:"name"`
	Title     *string         `mapstructure:"title" yaml:"title,omitempty" json:"title,omitempty"`
	Component *string         `mapstructure:"component" yaml:"component,omitempty" json:"component,omitempty"`
	Size      *int            `mapstructure:"size" yaml:"size,omitempty" json:"size,omitempty"`
	Params    *map[string]any `mapstructure:"params" yaml:"params,omitempty" json:"params,omitempty"`
}
