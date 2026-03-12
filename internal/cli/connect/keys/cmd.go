package keys

import (
	"github.com/spf13/cobra"
	"github.com/ygelfand/power-dash/internal/config"
)

func NewConnectKeysCmd(opts *config.PowerwallOptions) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "keys",
		Short: "manage authorized RSA keys on the Powerwall",
	}
	cmd.AddCommand(newKeysListCmd(opts))
	cmd.AddCommand(newKeysAddCmd(opts))
	cmd.AddCommand(newKeysRemoveCmd(opts))
	return cmd
}
