package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/utils"
)

// set at build time
var (
	debugMode = "true"
	cfgFile   string
)

// Global options struct instance
var o = &config.PowerwallOptions{}

var rootCmd = &cobra.Command{
	Use:   "power-dash",
	Short: "power-dash dashboard and automation",
	Long:  `Power dash is a complete self hosted powerwall dashboard and automation platform`,
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		// Update options from viper (which handles merge of flags, env, config, defaults)
		o.Endpoint = viper.GetString("endpoint")
		o.Password = viper.GetString("password")

		if o.Password == "" && cmd.Use != "version" {
			return fmt.Errorf("password is required (via flag, env POWER_DASH_PASSWORD, or config file)")
		}
		return nil
	},
}

func Execute() {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
}

func init() {
	cobra.OnInitialize(initConfig)

	// Set debug mode from build flag
	o.DebugMode = debugMode == "true"

	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default is $HOME/.power-dash.yaml)")

	// Define flags. Defaults are handled here or by viper if not set.
	// We set the default in StringVarP to the default value, not viper.GetString,
	// because we want Viper to handle the precedence logic in PreRun.
	rootCmd.PersistentFlags().StringVarP(&o.Endpoint, "endpoint", "e", "https://192.168.91.1/", "powerwall endpoint url")
	rootCmd.PersistentFlags().StringVarP(&o.Password, "password", "p", "", "powerwall installer password")

	// Bind flags to viper so viper knows about them
	viper.BindPFlag("endpoint", rootCmd.PersistentFlags().Lookup("endpoint"))
	viper.BindPFlag("password", rootCmd.PersistentFlags().Lookup("password"))

	// Initialize Logger for startup errors or other use before Run
	logger, _ := utils.NewLogger("info")

	rootCmd.AddCommand(newRunCmd(o))
	rootCmd.AddCommand(newDebugCmd(o, logger))
	rootCmd.AddCommand(versionCmd)
	versionCmd.InheritedFlags().SetAnnotation("password", cobra.BashCompOneRequiredFlag, []string{"false"})
}

func initConfig() {
	if cfgFile != "" {
		// Use config file from the flag.
		viper.SetConfigFile(cfgFile)
	} else {
		// Find home directory.
		home, err := os.UserHomeDir()
		if err == nil {
			viper.AddConfigPath(home)
		}
		viper.AddConfigPath(".")
		viper.AddConfigPath("/etc/power-dash/")
		viper.SetConfigName("power-dash")
		// Viper will check for power-dash.yaml, power-dash.json, power-dash.toml etc.
	}

	viper.SetEnvPrefix("POWER_DASH")
	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err == nil {
		// Check if debug mode is enabled, can't check 'o.DebugMode' easily here as it might be too early or noise
		// fmt.Fprintln(os.Stderr, "Using config file:", viper.ConfigFileUsed())
	}
}
