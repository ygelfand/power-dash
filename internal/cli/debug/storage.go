package debug

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"github.com/ygelfand/power-dash/internal/store"
	"go.uber.org/zap"
)

func NewDebugStorageCmd(logger *zap.Logger) *cobra.Command {
	storageCmd := &cobra.Command{
		Use:   "storage",
		Short: "Inspect local storage",
	}

	storageCmd.AddCommand(&cobra.Command{
		Use:   "stats",
		Short: "Display storage statistics",
		Run: func(cmd *cobra.Command, args []string) {
			dataPath := viper.GetString("storage.path")
			if dataPath == "" {
				dataPath = "./data"
			}

			retentionStr := viper.GetString("storage.retention")
			retention := time.Duration(0)
			if retentionStr != "" {
				if d, err := time.ParseDuration(retentionStr); err == nil {
					retention = d
				}
			}

			partitionStr := viper.GetString("storage.partition")
			partition := 2 * time.Hour
			if partitionStr != "" {
				if d, err := time.ParseDuration(partitionStr); err == nil && d > 0 {
					partition = d
				}
			}

			st, err := store.NewStore(store.Config{
				DataPath:          dataPath,
				Retention:         retention,
				PartitionDuration: partition,
			}, logger)
			if err != nil {
				cmd.PrintErrf("Failed to open storage: %v\n", err)
				return
			}
			defer st.Close()

			fmt.Printf("Storage stats (%s):\n", dataPath)

			allSeries := st.GetAllSeries()
			var metrics []string
			for m := range allSeries {
				metrics = append(metrics, m)
			}
			sort.Strings(metrics)

			fmt.Printf("Total metrics: %d\n\n", len(metrics))
			fmt.Printf("% -40s % -40s\n", "METRIC", "LABELS")
			fmt.Println(strings.Repeat("-", 81))

			for _, m := range metrics {
				seriesMap := allSeries[m]
				for _, labels := range seriesMap {
					labelStr := ""
					var lStrs []string
					for _, l := range labels {
						lStrs = append(lStrs, fmt.Sprintf("%s=%s", l.Name, l.Value))
					}
					labelStr = strings.Join(lStrs, ",")
					fmt.Printf("% -40s % -40s\n", m, labelStr)
				}
			}
		},
	})

	storageCmd.AddCommand(&cobra.Command{
		Use:   "query [metric]",
		Short: "Query raw data for a metric",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			metric := args[0]
			dataPath := viper.GetString("storage.path")
			if dataPath == "" {
				dataPath = "./data"
			}

			retentionStr := viper.GetString("storage.retention")
			retention := time.Duration(0)
			if retentionStr != "" {
				if d, err := time.ParseDuration(retentionStr); err == nil {
					retention = d
				}
			}

			partitionStr := viper.GetString("storage.partition")
			partition := 2 * time.Hour
			if partitionStr != "" {
				if d, err := time.ParseDuration(partitionStr); err == nil && d > 0 {
					partition = d
				}
			}

			st, err := store.NewStore(store.Config{
				DataPath:          dataPath,
				Retention:         retention,
				PartitionDuration: partition,
			}, logger)
			if err != nil {
				cmd.PrintErrf("Failed to open storage: %v\n", err)
				return
			}
			defer st.Close()

			now := time.Now().Unix()
			start := now - 86400*7 // 7 days

			seriesList := st.GetSeries(metric)
			if len(seriesList) == 0 {
				fmt.Printf("No series found for metric: %s\n", metric)
				return
			}

			for _, lbls := range seriesList {
				tagMap := make(map[string]string)
				var lStrs []string
				for _, l := range lbls {
					tagMap[l.Name] = l.Value
					lStrs = append(lStrs, fmt.Sprintf("%s=%s", l.Name, l.Value))
				}
				fmt.Printf("Series: %s\n", strings.Join(lStrs, ","))

				points, err := st.Select(metric, tagMap, start, now, 0, "")
				if err != nil {
					fmt.Printf("  Error: %v\n", err)
					continue
				}
				fmt.Printf("  Points: %d\n", len(points))
				if len(points) > 0 {
					first := points[0]
					last := points[len(points)-1]
					fmt.Printf("  Range: %s to %s\n",
						time.Unix(first.Timestamp, 0).Format(time.RFC3339),
						time.Unix(last.Timestamp, 0).Format(time.RFC3339))
					fmt.Printf("  Values: First=%.2f, Last=%.2f\n", first.Value, last.Value)
				}
			}
		},
	})

	return storageCmd
}
