package cli

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"github.com/ygelfand/power-dash/internal/api"
	"github.com/ygelfand/power-dash/internal/collector"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/powerwall"
	"github.com/ygelfand/power-dash/internal/store"
	"github.com/ygelfand/power-dash/internal/utils"
	"go.uber.org/zap"
)

func newRunCmd(opts *config.PowerwallOptions) *cobra.Command {
	o := &config.ProxyOptions{PowerwallOptions: *opts}
	runCmd := &cobra.Command{
		Use:   "run",
		Short: "start power-dash server",
		Long:  `Start power-dash dashboard and automation server`,
		Run: func(cmd *cobra.Command, args []string) {
			// Initialize Zap Logger
			logger, err := utils.NewLogger(o.LogLevel)
			if err != nil {
				panic(err)
			}
			defer func() {
				_ = logger.Sync()
			}()

			if err := viper.Unmarshal(o); err != nil {
				logger.Error("Unable to decode into struct", zap.Error(err))
				os.Exit(1)
			}

			cfgUsed := viper.ConfigFileUsed()
			if cfgUsed != "" {
				logger.Info("Using configuration file", zap.String("path", cfgUsed))
			} else {
				logger.Warn("No configuration file found, using defaults and flags")
			}

			logger.Info("Configuration loaded", zap.Int("dashboards", len(o.Dashboards)))

			ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
			defer stop()

			pwr := powerwall.NewPowerwallGateway(o.Endpoint, o.Password, logger)
			if pwr == nil {
				os.Exit(1)
			}

			st, err := store.NewStore(store.Config{
				DataPath:          o.Storage.DataPath,
				Retention:         o.Storage.GetRetention(),
				PartitionDuration: o.Storage.GetPartitionDuration(),
			}, logger)
			if err != nil {
				logger.Error("Failed to initialize storage", zap.Error(err))
				os.Exit(1)
			}
			defer st.Close()

			var cm *collector.Manager
			if !o.DisableCollector {
				collectionInterval := 30 * time.Second
				if o.CollectionInterval > 0 {
					collectionInterval = time.Duration(o.CollectionInterval) * time.Second
				}
				cm = collector.NewManager(st, collectionInterval, logger)
				cm.Register(collector.NewDeviceCollector(pwr))
				cm.Register(collector.NewGridCollector(pwr))
				cm.Register(collector.NewAggregatesCollector(pwr))
				cm.Register(collector.NewSoeCollector(pwr))
				cm.Register(collector.NewConfigCollector(pwr, logger))
				cm.Start()
				defer cm.Stop()
			} else {
				logger.Info("Collector is disabled")
			}

			if !o.DebugMode {
				gin.SetMode(gin.ReleaseMode)
			}
			gin.ForceConsoleColor()

			o.ConfigPath = viper.ConfigFileUsed()
			app := api.NewApi(pwr, st, cm, o, logger)

			srv := &http.Server{
				Addr:    o.ListenOn,
				Handler: app.Handler(),
			}

			go func() {
				if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
					logger.Error("ListenAndServe failed", zap.Error(err))
					os.Exit(1)
				}
			}()

			<-ctx.Done()
			logger.Info("Shutting down gracefully...")

			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := srv.Shutdown(shutdownCtx); err != nil {
				logger.Error("Server forced to shutdown", zap.Error(err))
				os.Exit(1)
			}
		},
	}
	runCmd.Flags().BoolVar(&o.DisableCollector, "no-collector", false, "disable data collection")

	defaults := config.NewDefaultProxyOptions()
	runCmd.Flags().StringVarP(&o.ListenOn, "listen", "l", defaults.ListenOn, "host:port to listen on")
	runCmd.Flags().Uint32Var(&o.CollectionInterval, "collection-interval", defaults.CollectionInterval, "data collection frequency in seconds")
	runCmd.Flags().BoolVar(&o.AutoRefresh, "auto-refresh", defaults.AutoRefresh, "enable auto-refresh on startup")
	runCmd.Flags().StringVar(&o.DefaultTheme, "default-theme", defaults.DefaultTheme, "default UI theme (light, dark, auto)")
	runCmd.Flags().StringVar(&o.LogLevel, "log-level", defaults.LogLevel, "log level (debug, info, warn, error)")

	runCmd.Flags().StringVar(&o.Storage.DataPath, "storage-path", defaults.Storage.DataPath, "path to storage directory")
	runCmd.Flags().StringVar(&o.Storage.Retention, "storage-retention", defaults.Storage.Retention, "data retention period (e.g. 7d, 168h, 0s for infinity)")
	runCmd.Flags().StringVar(&o.Storage.PartitionDuration, "storage-partition", defaults.Storage.PartitionDuration, "partition duration (e.g. 2h)")

	viper.BindPFlag("storage.path", runCmd.Flags().Lookup("storage-path"))
	viper.BindPFlag("storage.retention", runCmd.Flags().Lookup("storage-retention"))
	viper.BindPFlag("storage.partition", runCmd.Flags().Lookup("storage-partition"))

	return runCmd
}
