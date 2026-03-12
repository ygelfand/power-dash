package cli

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/utils"
	"go.uber.org/zap"
)

// set at build time
var (
	debugMode = "true"
	cfgFile   string
	debugFlag bool
)

var o = &config.PowerwallOptions{}

var logger, logLevel = utils.NewAtomicLogger()

var rootCmd = &cobra.Command{
	Use:   "power-dash",
	Short: "power-dash dashboard and automation",
	Long:  `Power dash is a complete self hosted powerwall dashboard and automation platform`,
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		if debugFlag {
			logLevel.SetLevel(zap.DebugLevel)
		}
		o.Endpoint = viper.GetString("endpoint")
		o.Password = viper.GetString("password")
		o.ConnectionMode = config.ConnectionMode(viper.GetString("connection-mode"))
		o.KeyPath = viper.GetString("key-path")
		o.DIN = viper.GetString("din")

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

	o.DebugMode = debugMode == "true"

	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default is $HOME/.power-dash.yaml)")
	rootCmd.PersistentFlags().StringVarP(&o.Endpoint, "endpoint", "e", "https://192.168.91.1/", "powerwall endpoint url")
	rootCmd.PersistentFlags().StringVarP(&o.Password, "password", "p", "", "powerwall installer password")
	rootCmd.PersistentFlags().StringVar((*string)(&o.ConnectionMode), "connection-mode", string(config.ConnectionModeWifi), "connection mode (wifi, lan)")
	rootCmd.PersistentFlags().StringVar(&o.KeyPath, "key-path", "tedapi_rsa_private.pem", "path to RSA private key (required for lan/v1r mode)")
	rootCmd.PersistentFlags().StringVar(&o.DIN, "din", "", "gateway DIN (skips /tedapi/din fetch)")
	rootCmd.PersistentFlags().BoolVar(&debugFlag, "debug", false, "enable debug logging")

	viper.BindPFlag("endpoint", rootCmd.PersistentFlags().Lookup("endpoint"))
	viper.BindPFlag("password", rootCmd.PersistentFlags().Lookup("password"))
	viper.BindPFlag("connection-mode", rootCmd.PersistentFlags().Lookup("connection-mode"))
	viper.BindPFlag("key-path", rootCmd.PersistentFlags().Lookup("key-path"))
	viper.BindPFlag("din", rootCmd.PersistentFlags().Lookup("din"))

	rootCmd.AddCommand(newRunCmd(o))
	rootCmd.AddCommand(newDebugCmd(o, logger))
	rootCmd.AddCommand(newConnectCmd(o, logger))
	rootCmd.AddCommand(versionCmd)
	versionCmd.InheritedFlags().SetAnnotation("password", cobra.BashCompOneRequiredFlag, []string{"false"})
}

func initConfig() {
	if cfgFile != "" {
		viper.SetConfigFile(cfgFile)
	} else {
		home, err := os.UserHomeDir()
		if err == nil {
			viper.AddConfigPath(home)
		}
		viper.AddConfigPath(".")
		viper.AddConfigPath("/etc/power-dash/")
		viper.SetConfigName("power-dash")
	}

	viper.SetEnvPrefix("POWER_DASH")
	viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_"))
	viper.AutomaticEnv()
	viper.ReadInConfig()
}
