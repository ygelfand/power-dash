package cli

import (
	"github.com/spf13/cobra"
	"github.com/ygelfand/power-dash/internal/cli/connect"
	"github.com/ygelfand/power-dash/internal/cli/connect/keys"
	"github.com/ygelfand/power-dash/internal/config"
	"go.uber.org/zap"
)

func newConnectCmd(opts *config.PowerwallOptions, logger *zap.Logger) *cobra.Command {
	connectCmd := &cobra.Command{
		Use:   "connect",
		Short: "connectivity and authentication commands",
		Long:  `Commands for managing Fleet API authentication, key registration, and gateway connectivity.`,
	}
	connectCmd.AddCommand(connect.NewConnectValidateCmd(opts, logger))
	connectCmd.AddCommand(connect.NewConnectAuthCmd(opts))
	connectCmd.AddCommand(keys.NewConnectKeysCmd(opts))
	return connectCmd
}
