package keys

import (
	"github.com/spf13/cobra"
	"github.com/ygelfand/power-dash/internal/config"
)

func newKeysListCmd(opts *config.PowerwallOptions) *cobra.Command {
	var (
		tokensFile string
		region     string
		siteID     int64
	)
	cmd := &cobra.Command{
		Use:   "list",
		Short: "list authorized RSA keys registered with the Powerwall",
		RunE: func(cmd *cobra.Command, args []string) error {
			tokens, err := loadTokens(tokensFile, "", "")
			if err != nil {
				return err
			}
			client, siteID, _, err := resolveClient(tokens, tokensFile, region, siteID)
			if err != nil {
				return err
			}

			_, _, err = showKeys(client, tokens.AccessToken, siteID)
			return err
		},
	}
	addTokenFlags(cmd, &tokensFile, &region, &siteID)
	return cmd
}
