package debug

import (
	"bytes"
	"encoding/json"

	"github.com/spf13/cobra"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/powerwall"
	"go.uber.org/zap"
)

func NewDebugConfigCmd(opts *config.PowerwallOptions, logger *zap.Logger) *cobra.Command {
	return &cobra.Command{
		Use:   "config [queryName]",
		Short: "pull config",
		Long:  `Pulls json config from firewall.`,
		Run: func(cmd *cobra.Command, args []string) {
			pwr := powerwall.NewPowerwallGateway(opts.Endpoint, opts.Password, logger)
			if pwr == nil {
				return
			}
			debug := pwr.GetConfig()
			if debug != nil {
				var prettyJSON bytes.Buffer
				err := json.Indent(&prettyJSON, []byte(*debug), "", "\t")
				if err != nil {
					logger.Error("JSON parse error", zap.Error(err))
				}
				cmd.Println(string(prettyJSON.Bytes()))
			}
		},
	}
}
