package debug

import (
	"bytes"
	"encoding/json"

	"github.com/spf13/cobra"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/powerwall"
	"github.com/ygelfand/power-dash/internal/powerwall/queries"
	"go.uber.org/zap"
)

func NewDebugValidateCmd(opts *config.PowerwallOptions, logger *zap.Logger) *cobra.Command {
	validateCmd := &cobra.Command{
		Use:       "validate",
		Short:     "run all saved queries",
		Long:      `Runs aall available queries for debug.`,
		ValidArgs: queries.QueryList(),
		Run: func(cmd *cobra.Command, args []string) {
			pwr := powerwall.NewPowerwallGateway(opts.Endpoint, opts.Password, logger)
			if pwr == nil {
				return
			}
			var prettyJSON bytes.Buffer
			for _, q := range queries.QueryList() {
				cmd.Println(q)
				debug := pwr.RunQuery(q, nil)
				if debug == nil {
					logger.Info("Query returned no data", zap.String("query", q))
					continue
				}
				err := json.Indent(&prettyJSON, []byte(*debug), "", "\t")
				if err != nil {
					logger.Error("JSON parse error", zap.Error(err))
				}
				cmd.Println(string(prettyJSON.Bytes()))
			}
		},
	}
	return validateCmd
}
