package debug

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/powerwall"
	"github.com/ygelfand/power-dash/internal/powerwall/queries"
	"go.uber.org/zap"
)

var params string

// queryCmd represents the query command
func NewDebugQueryCmd(opts *config.PowerwallOptions, logger *zap.Logger) *cobra.Command {
	queryCmd := &cobra.Command{
		Use:       "query [queryName]",
		Short:     "run a saved query",
		Long:      `Runs an available query for debug.`,
		ValidArgs: queries.QueryList(),
		Args:      cobra.MatchAll(cobra.ExactArgs(1), cobra.OnlyValidArgs),
		Run: func(cmd *cobra.Command, args []string) {
			pwr := powerwall.NewPowerwallGateway(opts.Endpoint, opts.Password, logger)
			if pwr == nil {
				return
			}
			debug := pwr.RunQuery(args[0], &params)
			var prettyJSON bytes.Buffer
			err := json.Indent(&prettyJSON, []byte(*debug), "", "\t")
			if err != nil {
				logger.Error("JSON parse error", zap.Error(err), zap.String("response", *debug))
			}

			cmd.Println(string(prettyJSON.Bytes()))
		},
	}
	queryCmd.Flags().StringVarP(&params, "params", "m", "", "params")
	originalUsageFunc := queryCmd.UsageFunc()
	queryCmd.SetUsageFunc(func(cmd *cobra.Command) error {
		originalUsageFunc(cmd)
		fmt.Fprintf(cmd.OutOrStderr(), "\nKnown queries:\n")
		for _, arg := range cmd.ValidArgs {
			fmt.Fprintf(cmd.OutOrStderr(), "  %s\n", arg)
		}
		fmt.Fprintf(cmd.OutOrStderr(), "\n")
		return nil
	})
	return queryCmd
}
