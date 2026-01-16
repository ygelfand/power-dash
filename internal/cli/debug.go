package cli

import (
	"github.com/spf13/cobra"
	"github.com/ygelfand/power-dash/internal/cli/debug"
	"github.com/ygelfand/power-dash/internal/config"
	"go.uber.org/zap"
)

func newDebugCmd(opts *config.PowerwallOptions, logger *zap.Logger) *cobra.Command {
	debugCmd := &cobra.Command{
		Use:   "debug",
		Short: "run debug",
		Long:  `run some statuses for debug`,
	}
	debugCmd.AddCommand(debug.NewDebugQueryCmd(opts, logger))
	debugCmd.AddCommand(debug.NewDebugConfigCmd(opts, logger))
	debugCmd.AddCommand(debug.NewDebugValidateCmd(opts, logger))
	debugCmd.AddCommand(debug.NewDebugStorageCmd(logger))
	return debugCmd
}
