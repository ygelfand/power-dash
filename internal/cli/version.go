package cli

import (
	"fmt"
	"runtime/debug"
	"time"

	"github.com/spf13/cobra"
)

var PowerDashVersion string

func getPowerDashVersion() string {
	noVersionAvailable := "No version info available for this build, run 'power-dash help version' for additional info"

	if len(PowerDashVersion) != 0 {
		return PowerDashVersion
	}

	bi, ok := debug.ReadBuildInfo()
	if !ok {
		return noVersionAvailable
	}

	if bi.Main.Version != "(devel)" {
		return bi.Main.Version
	}

	var vcsRevision string
	var vcsTime time.Time
	for _, setting := range bi.Settings {
		switch setting.Key {
		case "vcs.revision":
			vcsRevision = setting.Value
		case "vcs.time":
			vcsTime, _ = time.Parse(time.RFC3339, setting.Value)
		}
	}

	if vcsRevision != "" {
		return fmt.Sprintf("%s, (%s)", vcsRevision, vcsTime)
	}

	return noVersionAvailable
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Display application version information.",
	Long: `
The version command provides information about the application's version.

	`,
	Run: func(cmd *cobra.Command, args []string) {
		version := getPowerDashVersion()
		fmt.Printf("Power Dash version: %v\n", version)
	},
}
