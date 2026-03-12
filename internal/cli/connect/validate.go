package connect

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/powerwall"
	"go.uber.org/zap"
)

var allModes = []config.ConnectionMode{
	config.ConnectionModeWifi,
	config.ConnectionModeLan,
}

func NewConnectValidateCmd(opts *config.PowerwallOptions, logger *zap.Logger) *cobra.Command {
	return &cobra.Command{
		Use:   "validate",
		Short: "probe all connection modes and report availability",
		Long:  `Tests connectivity to the Powerwall gateway for each supported connection mode (wifi, lan) and reports which checks pass.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			// Initialise with wifi mode so getDin (mode-agnostic) can bootstrap.
			probeOpts := *opts
			probeOpts.ConnectionMode = config.ConnectionModeWifi
			pwr := powerwall.NewPowerwallGateway(&probeOpts, logger)
			if pwr == nil {
				return fmt.Errorf("❌ cannot reach gateway at %s — check endpoint and password", opts.Endpoint)
			}

			cmd.Printf("🔋 Gateway: %s\n", opts.Endpoint)
			cmd.Printf("📟 DIN:     %s\n\n", pwr.Din)

			for _, mode := range allModes {
				cmd.Printf("── %s mode ──────────────────────\n", mode)
				results := pwr.ConnectivityCheck(mode)
				for _, r := range results {
					icon := "✅"
					detail := ""
					if !r.OK {
						icon = "❌"
					}
					if r.Message != "" {
						detail = "  " + r.Message
					}
					cmd.Printf("   %s %-10s%s\n", icon, r.Name, detail)
				}
				cmd.Println()
			}
			return nil
		},
	}
}
